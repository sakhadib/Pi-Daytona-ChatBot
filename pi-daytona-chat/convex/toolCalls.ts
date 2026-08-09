import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const listByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("toolCalls")
      .withIndex("by_thread_turn_sequence", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});

export const startInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    turnId: v.string(),
    sequence: v.number(),
    toolCallId: v.optional(v.string()),
    toolName: v.string(),
    input: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("toolCalls", {
      threadId: args.threadId,
      turnId: args.turnId,
      sequence: args.sequence,
      toolCallId: args.toolCallId,
      toolName: args.toolName,
      input: args.input,
      status: "started",
      startedAt: Date.now(),
    });
  },
});

export const updateInternal = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    output: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.toolCallId, {
      output: args.output,
      status: "streaming",
    });
  },
});

export const completeInternal = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    output: v.any(),
    isError: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.toolCallId, {
      output: args.output,
      status: args.isError ? "failed" : "complete",
      completedAt: Date.now(),
      error: args.isError ? stringifyOutput(args.output) : undefined,
    });
  },
});

export const failActiveByTurnInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    turnId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("toolCalls")
      .withIndex("by_thread_turn_sequence", (q) =>
        q.eq("threadId", args.threadId).eq("turnId", args.turnId),
      )
      .collect();

    await Promise.all(
      active
        .filter((call) => call.status === "started" || call.status === "streaming")
        .map((call) =>
          ctx.db.patch(call._id, {
            status: "failed",
            completedAt: Date.now(),
            error: args.error,
          }),
        ),
    );
  },
});

function stringifyOutput(output: unknown) {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}
