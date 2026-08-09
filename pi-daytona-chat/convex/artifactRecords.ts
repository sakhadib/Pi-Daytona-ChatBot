import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

const artifactValidator = v.object({
  path: v.string(),
  name: v.string(),
  size: v.number(),
  modified: v.string(),
});

export const listByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

export const replaceForTurnInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    turnId: v.string(),
    artifacts: v.array(artifactValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_thread_turn", (q) => q.eq("threadId", args.threadId).eq("turnId", args.turnId))
      .collect();

    await Promise.all(existing.map((artifact) => ctx.db.delete(artifact._id)));

    const now = Date.now();
    await Promise.all(
      args.artifacts.map((artifact) =>
        ctx.db.insert("artifacts", {
          threadId: args.threadId,
          turnId: args.turnId,
          path: artifact.path,
          name: artifact.name,
          size: artifact.size,
          modified: artifact.modified,
          createdAt: now,
        }),
      ),
    );
  },
});
