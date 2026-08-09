import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

const eventKind = v.union(
  v.literal("assistant_delta"),
  v.literal("tool_delta"),
  v.literal("tool_call"),
  v.literal("tool_result"),
  v.literal("status"),
  v.literal("error"),
);

export const listByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_turn_sequence", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(300);
  },
});

export const addInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    turnId: v.string(),
    sequence: v.number(),
    kind: eventKind,
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("streamEvents", {
      threadId: args.threadId,
      turnId: args.turnId,
      sequence: args.sequence,
      kind: args.kind,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});
