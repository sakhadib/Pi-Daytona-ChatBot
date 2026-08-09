import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  threads: defineTable({
    title: v.string(),
    status: v.union(
      v.literal("creating"),
      v.literal("ready"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("stopped"),
    ),
    daytonaSessionId: v.optional(v.string()),
    daytonaSessionName: v.optional(v.string()),
    runtimeStatus: v.optional(v.string()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"]),

  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("streaming"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    turnId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread_createdAt", ["threadId", "createdAt"])
    .index("by_turnId", ["turnId"]),

  sessions: defineTable({
    threadId: v.id("threads"),
    daytonaSessionId: v.string(),
    daytonaRuntime: v.union(v.literal("vm"), v.literal("sandbox")),
    region: v.string(),
    bootstrapVersion: v.string(),
    status: v.union(
      v.literal("provisioning"),
      v.literal("bootstrapped"),
      v.literal("failed"),
      v.literal("deleted"),
      v.literal("stopped"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_daytonaSessionId", ["daytonaSessionId"]),

  toolCalls: defineTable({
    threadId: v.id("threads"),
    turnId: v.string(),
    sequence: v.number(),
    toolCallId: v.optional(v.string()),
    toolName: v.string(),
    input: v.any(),
    output: v.optional(v.any()),
    status: v.union(
      v.literal("started"),
      v.literal("streaming"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_thread_turn_sequence", ["threadId", "turnId", "sequence"]),

  streamEvents: defineTable({
    threadId: v.id("threads"),
    turnId: v.string(),
    sequence: v.number(),
    kind: v.union(
      v.literal("assistant_delta"),
      v.literal("tool_delta"),
      v.literal("tool_call"),
      v.literal("tool_result"),
      v.literal("status"),
      v.literal("error"),
    ),
    payload: v.any(),
    createdAt: v.number(),
  }).index("by_thread_turn_sequence", ["threadId", "turnId", "sequence"]),

  artifacts: defineTable({
    threadId: v.id("threads"),
    turnId: v.string(),
    path: v.string(),
    name: v.string(),
    size: v.number(),
    modified: v.string(),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_turn", ["threadId", "turnId"]),
});
