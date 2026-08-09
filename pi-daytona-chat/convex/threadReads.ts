import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const messagesInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread_createdAt", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});
