"use node";

import path from "node:path";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getDaytona, listRuntimeArtifacts, runtimeEnv } from "./daytonaClient";
import { RUNTIME_DIR } from "./runtimeSource";

export const list = action({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args): Promise<Array<{ path: string; name: string; size: number; modified: string }>> => {
    const thread = await ctx.runQuery(internal.threadReads.getInternal, { threadId: args.threadId });
    if (!thread?.daytonaSessionId) return [];

    const sandbox = await getDaytona().get(thread.daytonaSessionId);
    return await listRuntimeArtifacts(sandbox);
  },
});

export const download = action({
  args: {
    threadId: v.id("threads"),
    path: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ path: string; name: string; mimeType: string; base64: string }> => {
    const safePath = normalizeArtifactPath(args.path);
    const thread = await ctx.runQuery(internal.threadReads.getInternal, { threadId: args.threadId });
    if (!thread?.daytonaSessionId) throw new Error("Thread has no Daytona session");

    const sandbox = await getDaytona().get(thread.daytonaSessionId);
    const response = await sandbox.process.executeCommand(
      `base64 -w 0 -- ${shellQuote(safePath)}`,
      RUNTIME_DIR,
      runtimeEnv(),
      60,
    );

    if (response.exitCode !== 0) {
      throw new Error(response.result || `Unable to download ${safePath}`);
    }

    return {
      path: safePath,
      name: path.basename(safePath),
      mimeType: mimeTypeFor(safePath),
      base64: (response.result || "").trim(),
    };
  },
});

function normalizeArtifactPath(value: string) {
  const normalized = path.posix.normalize(value.replace(/^\.?\//, ""));
  if (!normalized || normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) {
    throw new Error("Invalid artifact path");
  }
  return normalized;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function mimeTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".py") return "text/x-python";
  if (ext === ".json") return "application/json";
  if (ext === ".md") return "text/markdown";
  if (ext === ".html") return "text/html";
  if (ext === ".txt") return "text/plain";
  return "application/octet-stream";
}
