"use node";

import process from "node:process";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { VM_SNAPSHOT } from "./runtimeSource";
import { bootstrapRuntime, getDaytona, runtimeEnv } from "./daytonaClient";

type DaytonaRuntime = "vm" | "sandbox";

export const createThreadSession = action({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ threadId: Id<"threads">; daytonaSessionId: string }> => {
    const title = args.title?.trim() || "New conversation";
    const threadId: Id<"threads"> = await ctx.runMutation(internal.threads.createPendingInternal, { title });
    const sessionName = `pi-thread-${threadId}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 60);

    try {
      const daytona = getDaytona();
      const snapshot = process.env.DAYTONA_SNAPSHOT?.trim();
      const runtime: DaytonaRuntime = snapshot ? "vm" : "sandbox";
      const sandbox = await daytona.create(createSandboxParams(sessionName, threadId, runtime, snapshot), {
        timeout: 180,
      });

      await ctx.runMutation(internal.sessions.createInternal, {
        threadId,
        daytonaSessionId: sandbox.id,
        daytonaRuntime: runtime,
        region: process.env.DAYTONA_TARGET ?? "unknown",
      });

      await bootstrapRuntime(sandbox);

      await ctx.runMutation(internal.sessions.markStatusInternal, {
        threadId,
        status: "bootstrapped",
      });
      await ctx.runMutation(internal.threads.markReadyInternal, {
        threadId,
        daytonaSessionId: sandbox.id,
        daytonaSessionName: sessionName,
        runtimeStatus: `Daytona ${runtimeLabel(runtime)} ${sandbox.id} bootstrapped`,
      });

      return { threadId, daytonaSessionId: sandbox.id };
    } catch (error) {
      await ctx.runMutation(internal.threads.markStatusInternal, {
        threadId,
        status: "failed",
        runtimeStatus: "Session creation failed",
        lastError: errorMessage(error),
      });
      await ctx.runMutation(internal.sessions.markStatusInternal, {
        threadId,
        status: "failed",
      });
      throw error;
    }
  },
});

export const stopSession = action({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args): Promise<void> => {
    const thread = await ctx.runQuery(internal.threadReads.getInternal, {
      threadId: args.threadId,
    });
    if (!thread?.daytonaSessionId) {
      throw new Error("Thread has no Daytona session");
    }

    const daytona = getDaytona();
    const sandbox = await daytona.get(thread.daytonaSessionId);
    await sandbox.stop(60);

    await ctx.runMutation(internal.sessions.markStatusInternal, {
      threadId: args.threadId,
      status: "stopped",
    });
    await ctx.runMutation(internal.threads.markStatusInternal, {
      threadId: args.threadId,
      status: "stopped",
      runtimeStatus: "Daytona VM stopped",
    });
  },
});

export const deleteThread = action({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args): Promise<void> => {
    const thread = await ctx.runQuery(internal.threadReads.getInternal, {
      threadId: args.threadId,
    });

    if (thread?.daytonaSessionId) {
      try {
        const sandbox = await getDaytona().get(thread.daytonaSessionId);
        await sandbox.delete(60, false);
      } catch {
        // Keep deletion usable even if Daytona already removed or cannot reach the sandbox.
      }
    }

    await ctx.runMutation(internal.threads.deleteCascadeInternal, {
      threadId: args.threadId,
    });
  },
});

function createSandboxParams(
  sessionName: string,
  threadId: Id<"threads">,
  runtime: DaytonaRuntime,
  snapshot?: string,
) {
  const base = {
    name: sessionName,
    language: "typescript",
    envVars: runtimeEnv(),
    labels: {
      app: "pi-daytona-chat",
      threadId,
      runtime,
    },
    autoStopInterval: 60,
    autoArchiveInterval: 1440,
    ttlMinutes: 0,
  };

  if (runtime === "vm") {
    return {
      ...base,
      snapshot: snapshot || VM_SNAPSHOT,
    };
  }

  return base;
}

function runtimeLabel(runtime: DaytonaRuntime) {
  return runtime === "vm" ? "VM" : "sandbox";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
