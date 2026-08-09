import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { BOOTSTRAP_VERSION } from "./runtimeSource";

export const listByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

export const createInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    daytonaSessionId: v.string(),
    daytonaRuntime: v.union(v.literal("vm"), v.literal("sandbox")),
    region: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("sessions", {
      threadId: args.threadId,
      daytonaSessionId: args.daytonaSessionId,
      daytonaRuntime: args.daytonaRuntime,
      region: args.region,
      bootstrapVersion: BOOTSTRAP_VERSION,
      status: "provisioning",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markStatusInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    status: v.union(
      v.literal("provisioning"),
      v.literal("bootstrapped"),
      v.literal("failed"),
      v.literal("deleted"),
      v.literal("stopped"),
    ),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();

    await Promise.all(
      sessions.map((session) =>
        ctx.db.patch(session._id, {
          status: args.status,
          updatedAt: Date.now(),
        }),
      ),
    );
  },
});
