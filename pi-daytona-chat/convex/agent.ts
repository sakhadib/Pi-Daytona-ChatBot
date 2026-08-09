"use node";

import { Buffer } from "node:buffer";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getDaytona, listRuntimeArtifacts, runtimeEnv, type ArtifactMetadata } from "./daytonaClient";
import { RUNTIME_DIR } from "./runtimeSource";

type JsonEvent = Record<string, unknown>;
type EventKind = "assistant_delta" | "tool_delta" | "tool_call" | "tool_result" | "status" | "error";

export const runTurn = action({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    turnId: string;
    eventCount: number;
    toolCount: number;
    artifactCount: number;
  }> => {
    const content = args.content.trim();
    if (!content) throw new Error("Message content is required");

    const thread = await ctx.runQuery(internal.threadReads.getInternal, {
      threadId: args.threadId,
    });
    if (!thread) throw new Error("Thread not found");
    if (!thread.daytonaSessionId) throw new Error("Thread has no Daytona VM yet");
    if (thread.status !== "ready" && thread.status !== "running") {
      throw new Error(`Thread is not ready (${thread.status})`);
    }

    const turnId = crypto.randomUUID();
    await ctx.runMutation(internal.threads.markRunningInternal, { threadId: args.threadId });
    await ctx.runMutation(internal.messages.addUserInternal, {
      threadId: args.threadId,
      content,
      turnId,
    });
    const assistantMessageId = await ctx.runMutation(internal.messages.createAssistantInternal, {
      threadId: args.threadId,
      turnId,
    });

    let eventSequence = 0;
    const addEvent = async (kind: EventKind, payload: unknown) => {
      eventSequence += 1;
      await ctx.runMutation(internal.streamEvents.addInternal, {
        threadId: args.threadId,
        turnId,
        sequence: eventSequence,
        kind,
        payload,
      });
    };

    try {
      await addEvent("status", {
        message: "Dispatching turn to Pi inside Daytona VM",
        daytonaSessionId: thread.daytonaSessionId,
      });

      const messages = await ctx.runQuery(internal.threadReads.messagesInternal, {
        threadId: args.threadId,
      });
      const payload = {
        threadId: args.threadId,
        turnId,
        latestUserMessage: content,
        messages: messages.map((message: { role: string; content: string }) => ({
          role: message.role,
          content: message.content,
        })),
      };
      const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

      const daytona = getDaytona();
      const sandbox = await daytona.get(thread.daytonaSessionId);
      const beforeArtifacts = await safeListArtifacts(addEvent, sandbox, "before");
      const response = await sandbox.process.executeCommand(
        `node run-turn.mjs '${encoded}'`,
        RUNTIME_DIR,
        runtimeEnv(),
        600,
      );

      await addEvent("status", {
        message: "Daytona command completed; persisting Pi JSON events",
        exitCode: response.exitCode,
      });

      const stdout = response.artifacts?.stdout ?? response.result ?? "";
      const parsed = await persistPiEvents(ctx, {
        threadId: args.threadId,
        turnId,
        assistantMessageId,
        stdout,
        addEvent,
      });

      if (response.exitCode !== 0) {
        throw new Error(`Pi runtime exited with code ${response.exitCode}`);
      }

      const afterArtifacts = await safeListArtifacts(addEvent, sandbox, "after");
      const generatedArtifacts = diffArtifacts(beforeArtifacts, afterArtifacts);
      await ctx.runMutation(internal.artifactRecords.replaceForTurnInternal, {
        threadId: args.threadId,
        turnId,
        artifacts: generatedArtifacts,
      });

      await ctx.runMutation(internal.messages.completeAssistantInternal, {
        messageId: assistantMessageId,
        content: parsed.finalAssistantText || parsed.deltaText || undefined,
      });
      await ctx.runMutation(internal.threads.markStatusInternal, {
        threadId: args.threadId,
        status: "ready",
        runtimeStatus: "Last turn complete",
      });

      return {
        turnId,
        eventCount: parsed.eventCount,
        toolCount: parsed.toolCount,
        artifactCount: generatedArtifacts.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await addEvent("error", { message });
      await ctx.runMutation(internal.messages.failAssistantInternal, {
        messageId: assistantMessageId,
        error: message,
      });
      await ctx.runMutation(internal.toolCalls.failActiveByTurnInternal, {
        threadId: args.threadId,
        turnId,
        error: message,
      });
      await ctx.runMutation(internal.threads.markStatusInternal, {
        threadId: args.threadId,
        status: "failed",
        runtimeStatus: "Agent turn failed",
        lastError: message,
      });
      throw error;
    }
  },
});

async function safeListArtifacts(
  addEvent: (kind: EventKind, payload: unknown) => Promise<void>,
  sandbox: Parameters<typeof listRuntimeArtifacts>[0],
  phase: "before" | "after",
) {
  try {
    return await listRuntimeArtifacts(sandbox);
  } catch (error) {
    await addEvent("status", {
      message: `Artifact scan failed ${phase} agent turn`,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function diffArtifacts(before: ArtifactMetadata[], after: ArtifactMetadata[]) {
  const beforeByPath = new Map(before.map((artifact) => [artifact.path, artifactSignature(artifact)]));
  return after.filter((artifact) => beforeByPath.get(artifact.path) !== artifactSignature(artifact));
}

function artifactSignature(artifact: ArtifactMetadata) {
  return `${artifact.size}:${artifact.modified}`;
}

async function persistPiEvents(
  ctx: ActionCtx,
  args: {
    threadId: Id<"threads">;
    turnId: string;
    assistantMessageId: Id<"messages">;
    stdout: string;
    addEvent: (kind: EventKind, payload: unknown) => Promise<void>;
  },
) {
  const toolCalls = new Map<string, Id<"toolCalls">>();
  let toolSequence = 0;
  let eventCount = 0;
  let toolCount = 0;
  let deltaText = "";
  let finalAssistantText = "";

  for (const line of args.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: JsonEvent;
    try {
      event = JSON.parse(trimmed);
    } catch {
      await args.addEvent("status", { raw: trimmed });
      continue;
    }

    eventCount += 1;

    if (event.type === "message_update") {
      const assistantEvent = asRecord(event.assistantMessageEvent);
      if (assistantEvent?.type === "text_delta" && typeof assistantEvent.delta === "string") {
        deltaText += assistantEvent.delta;
        await ctx.runMutation(internal.messages.appendAssistantDeltaInternal, {
          messageId: args.assistantMessageId,
          delta: assistantEvent.delta,
        });
        await args.addEvent("assistant_delta", {
          delta: assistantEvent.delta,
          contentIndex: assistantEvent.contentIndex,
        });
      }
      continue;
    }

    if (event.type === "message_end" && event.message) {
      finalAssistantText = extractMessageText(event.message) || finalAssistantText;
      continue;
    }

    if (event.type === "tool_execution_start") {
      toolSequence += 1;
      toolCount += 1;
      const toolCallId = stringValue(event.toolCallId);
      const dbId = await ctx.runMutation(internal.toolCalls.startInternal, {
        threadId: args.threadId,
        turnId: args.turnId,
        sequence: toolSequence,
        toolCallId,
        toolName: String(event.toolName ?? "unknown"),
        input: event.args ?? {},
      });
      if (toolCallId) toolCalls.set(toolCallId, dbId);
      await args.addEvent("tool_call", {
        toolCallId,
        toolName: event.toolName,
        input: event.args,
      });
      continue;
    }

    if (event.type === "tool_execution_update") {
      const toolCallId = stringValue(event.toolCallId);
      const dbId = toolCallId ? toolCalls.get(toolCallId) : undefined;
      if (dbId) {
        await ctx.runMutation(internal.toolCalls.updateInternal, {
          toolCallId: dbId,
          output: event.partialResult,
        });
      }
      await args.addEvent("tool_delta", {
        toolCallId,
        toolName: event.toolName,
        output: event.partialResult,
      });
      continue;
    }

    if (event.type === "tool_execution_end") {
      const toolCallId = stringValue(event.toolCallId);
      const dbId = toolCallId ? toolCalls.get(toolCallId) : undefined;
      if (dbId) {
        await ctx.runMutation(internal.toolCalls.completeInternal, {
          toolCallId: dbId,
          output: event.result,
          isError: Boolean(event.isError),
        });
      }
      await args.addEvent("tool_result", {
        toolCallId,
        toolName: event.toolName,
        output: event.result,
        isError: event.isError,
      });
      continue;
    }

    if (event.type === "runtime_error") {
      await args.addEvent("error", event);
      continue;
    }

    await args.addEvent("status", event);
  }

  return {
    eventCount,
    toolCount,
    deltaText,
    finalAssistantText,
  };
}

function extractMessageText(message: unknown) {
  const record = asRecord(message);
  if (!record) return "";
  if (typeof record.content === "string") return record.content;
  if (!Array.isArray(record.content)) return "";

  return record.content
    .map((part: unknown) => {
      if (typeof part === "string") return part;
      const partRecord = asRecord(part);
      if (partRecord?.type === "text" && typeof partRecord.text === "string") return partRecord.text;
      if (typeof partRecord?.content === "string") return partRecord.content;
      return "";
    })
    .filter(Boolean)
    .join("");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
