import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const listByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread_createdAt", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});

export const addUserInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    turnId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "user",
      content: args.content,
      status: "complete",
      turnId: args.turnId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createAssistantInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    turnId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: "",
      status: "streaming",
      turnId: args.turnId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const appendAssistantDeltaInternal = internalMutation({
  args: {
    messageId: v.id("messages"),
    delta: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return;

    await ctx.db.patch(args.messageId, {
      content: message.content + args.delta,
      status: "streaming",
      updatedAt: Date.now(),
    });
  },
});

export const completeAssistantInternal = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content ?? (await ctx.db.get(args.messageId))?.content ?? "",
      status: "complete",
      updatedAt: Date.now(),
    });
  },
});

export const failAssistantInternal = internalMutation({
  args: {
    messageId: v.id("messages"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    await ctx.db.patch(args.messageId, {
      content: message?.content || `Agent execution failed: ${args.error}`,
      status: "failed",
      updatedAt: Date.now(),
    });
  },
});
