"use node";

import { Buffer } from "node:buffer";
import path from "node:path";
import process from "node:process";
import { Daytona, type Sandbox } from "@daytona/sdk";
import { RUNTIME_DIR, runtimeFiles } from "./runtimeSource";

export type ArtifactMetadata = { path: string; name: string; size: number; modified: string };

export function getDaytona() {
  const apiKey = requiredEnv("DAYTONA_API_KEY");
  return new Daytona({
    apiKey,
    apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
    target: process.env.DAYTONA_TARGET || "us",
    requestTimeoutMs: 0,
  });
}

export function runtimeEnv() {
  const env: Record<string, string> = {
    OPENROUTER_API_KEY: requiredEnv("OPENROUTER_API_KEY"),
    MODEL_ID: requiredEnv("MODEL_ID"),
    PI_TELEMETRY: "0",
    NODE_ENV: "production",
  };

  if (process.env.JINA_API_KEY) {
    env.JINA_API_KEY = process.env.JINA_API_KEY;
  }

  return env;
}

export async function bootstrapRuntime(sandbox: Sandbox) {
  await sandbox.process.executeCommand(
    `mkdir -p ${RUNTIME_DIR}/.pi/extensions ${RUNTIME_DIR}/.pi/sessions`,
    undefined,
    runtimeEnv(),
    30,
  );

  for (const file of runtimeFiles) {
    const remotePath = `${RUNTIME_DIR}/${file.path}`;
    const encoded = Buffer.from(file.content, "utf8").toString("base64");
    const command = `mkdir -p "$(dirname '${remotePath}')" && printf '%s' '${encoded}' | base64 -d > '${remotePath}'`;
    const written = await sandbox.process.executeCommand(command, undefined, runtimeEnv(), 60);
    if (written.exitCode !== 0) {
      throw new Error(`Failed to write ${remotePath}: ${written.result}`);
    }
  }

  const install = await sandbox.process.executeCommand("npm install --omit=dev", RUNTIME_DIR, runtimeEnv(), 300);
  if (install.exitCode !== 0) {
    throw new Error(`Runtime npm install failed: ${install.result}`);
  }

  const verify = await sandbox.process.executeCommand(
    "./node_modules/.bin/pi --version",
    RUNTIME_DIR,
    runtimeEnv(),
    30,
  );
  if (verify.exitCode !== 0) {
    throw new Error(`Pi verification failed: ${verify.result}`);
  }
}

export async function listRuntimeArtifacts(sandbox: Sandbox): Promise<ArtifactMetadata[]> {
  const response = await sandbox.process.executeCommand(
    [
      "find . -maxdepth 4 -type f",
      "! -path './node_modules/*'",
      "! -path './.pi/*'",
      "! -name 'package-lock.json'",
      "! -name 'package.json'",
      "! -name 'AGENTS.md'",
      "! -name 'run-turn.mjs'",
      "-printf '%p\\t%s\\t%TY-%Tm-%Td %TH:%TM\\n'",
      "| sort",
    ].join(" "),
    RUNTIME_DIR,
    runtimeEnv(),
    30,
  );

  if (response.exitCode !== 0) {
    throw new Error(response.result || "Unable to list artifacts");
  }

  return (response.result || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawPath, size = "0", modified = ""] = line.split("\t");
      const normalized = rawPath.replace(/^\.\//, "");
      return {
        path: normalized,
        name: path.basename(normalized),
        size: Number(size),
        modified,
      };
    });
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
