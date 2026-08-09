import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const threads = await ctx.db.query("threads").withIndex("by_createdAt").order("desc").take(50);
    return threads;
  },
});

export const get = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const rename = mutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) throw new Error("Conversation title is required");
    await ctx.db.patch(args.threadId, {
      title,
      updatedAt: Date.now(),
    });
  },
});

export const createPendingInternal = internalMutation({
  args: {
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("threads", {
      title: args.title,
      status: "creating",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markReadyInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    daytonaSessionId: v.string(),
    daytonaSessionName: v.string(),
    runtimeStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      status: "ready",
      daytonaSessionId: args.daytonaSessionId,
      daytonaSessionName: args.daytonaSessionName,
      runtimeStatus: args.runtimeStatus,
      lastError: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const markRunningInternal = internalMutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      status: "running",
      runtimeStatus: "Agent turn running",
      updatedAt: Date.now(),
    });
  },
});

export const markStatusInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    status: v.union(
      v.literal("creating"),
      v.literal("ready"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("stopped"),
    ),
    runtimeStatus: v.optional(v.string()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      status: args.status,
      runtimeStatus: args.runtimeStatus,
      lastError: args.lastError,
      updatedAt: Date.now(),
    });
  },
});

export const deleteCascadeInternal = internalMutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread_createdAt", (q) => q.eq("threadId", args.threadId))
      .collect();
    const toolCalls = await ctx.db
      .query("toolCalls")
      .withIndex("by_thread_turn_sequence", (q) => q.eq("threadId", args.threadId))
      .collect();
    const streamEvents = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_turn_sequence", (q) => q.eq("threadId", args.threadId))
      .collect();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    await Promise.all([
      ...messages.map((row) => ctx.db.delete(row._id)),
      ...toolCalls.map((row) => ctx.db.delete(row._id)),
      ...streamEvents.map((row) => ctx.db.delete(row._id)),
      ...sessions.map((row) => ctx.db.delete(row._id)),
      ...artifacts.map((row) => ctx.db.delete(row._id)),
    ]);
    await ctx.db.delete(args.threadId);
  },
});
