export const BOOTSTRAP_VERSION = "2026-08-09.1";
export const RUNTIME_DIR = "workspace/agent-runtime";
export const VM_SNAPSHOT = "daytona-vm-small";

export type RuntimeFile = {
  path: string;
  content: string;
};

export const runtimeFiles: RuntimeFile[] = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        type: "module",
        private: true,
        scripts: {
          turn: "node run-turn.mjs",
        },
        dependencies: {
          "@earendil-works/pi-coding-agent": "^0.84.1",
          glob: "^13.0.6",
          typebox: "1.3.7",
        },
      },
      null,
      2,
    ),
  },
  {
    path: "AGENTS.md",
    content: `You are running inside a dedicated Daytona sandbox/session for one chat thread.

Use tools only in this isolated Daytona environment. Treat its filesystem and shell as your execution environment.
Return concise, useful answers and explain tool results when they matter.
`,
  },
  {
    path: "run-turn.mjs",
    content: `import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

const payloadArg = process.argv[2];
if (!payloadArg) {
  console.error("Missing base64 payload");
  process.exit(2);
}

const payload = JSON.parse(Buffer.from(payloadArg, "base64url").toString("utf8"));
const modelId = process.env.MODEL_ID;
const apiKey = process.env.OPENROUTER_API_KEY;

if (!modelId) {
  console.error("MODEL_ID is required");
  process.exit(2);
}

if (!apiKey) {
  console.error("OPENROUTER_API_KEY is required");
  process.exit(2);
}

const history = payload.messages
  .map((message) => \`\${message.role.toUpperCase()}: \${message.content}\`)
  .join("\\n\\n");

const prompt = \`You are the Pi Agent for conversation \${payload.threadId}.

Architecture contract:
- You are running inside the dedicated Daytona sandbox/session for this thread.
- Use the tools available in this Daytona environment when filesystem, shell, or web work is needed.
- Required tool names are bash, read, write, edit, grep, glob, webfetch, websearch.
- Prefer structured, concise answers.

Conversation history:
\${history}

Latest user message:
\${payload.latestUserMessage}
\`;

const args = [
  "--mode",
  "json",
  "--provider",
  "openrouter",
  "--model",
  modelId,
  "--api-key",
  apiKey,
  "--session-dir",
  ".pi/sessions",
  "--name",
  \`thread-\${payload.threadId}\`,
  "--approve",
  "--tools",
  "bash,read,write,edit,grep,glob,webfetch,websearch",
  "-e",
  ".pi/extensions/assessment-tools.ts",
  prompt,
];

const child = spawn("./node_modules/.bin/pi", args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    OPENROUTER_API_KEY: apiKey,
    PI_TELEMETRY: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  for (const line of text.split(/\\r?\\n/)) {
    if (!line.trim()) continue;
    process.stdout.write(JSON.stringify({ type: "runtime_stderr", message: line }) + "\\n");
  }
});

child.on("exit", (code, signal) => {
  if (code && code !== 0) {
    process.stdout.write(
      JSON.stringify({
        type: "runtime_error",
        message: \`pi exited with code \${code}\${signal ? \` and signal \${signal}\` : ""}\`,
      }) + "\\n",
    );
  }
  process.exit(code ?? 1);
});
`,
  },
  {
    path: ".pi/settings.json",
    content: JSON.stringify(
      {
        defaultProjectTrust: "always",
        enableInstallTelemetry: false,
      },
      null,
      2,
    ),
  },
  {
    path: ".pi/extensions/assessment-tools.ts",
    content: `import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { glob as globMatch } from "glob";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type StructuredOutput = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
};

function textResult(output: StructuredOutput) {
  return {
    content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
    details: output,
  };
}

function limitText(text: string, max = 12000) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\\n...[truncated]";
}

export default function assessmentTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "glob",
    label: "Glob",
    description: "Match file paths in the Daytona VM using a glob pattern.",
    parameters: Type.Object({
      pattern: Type.String({ description: "Glob pattern, for example src/**/*.ts" }),
      cwd: Type.Optional(Type.String({ description: "Directory to search from. Defaults to the current working directory." })),
    }),
    async execute(_toolCallId, params) {
      try {
        const cwd = params.cwd ? path.resolve(String(params.cwd)) : process.cwd();
        const matches = await globMatch(String(params.pattern), {
          cwd,
          nodir: false,
          dot: true,
          absolute: false,
        });
        return textResult({
          ok: true,
          result: matches.slice(0, 500),
          metadata: { cwd, count: matches.length, truncated: matches.length > 500 },
        });
      } catch (error) {
        return textResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  });

  pi.registerTool({
    name: "webfetch",
    label: "Web Fetch",
    description: "Fetch web content from the Daytona VM network context.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch." }),
    }),
    async execute(_toolCallId, params) {
      try {
        const response = await fetch(String(params.url), {
          headers: { "User-Agent": "pi-daytona-chat/1.0" },
        });
        const contentType = response.headers.get("content-type") ?? "";
        const text = await response.text();
        return textResult({
          ok: response.ok,
          result: limitText(text),
          metadata: {
            url: response.url,
            status: response.status,
            statusText: response.statusText,
            contentType,
            length: text.length,
            truncated: text.length > 12000,
          },
        });
      } catch (error) {
        return textResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  });

  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description: "Search the web from the Daytona VM network context.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
    }),
    async execute(_toolCallId, params) {
      const query = String(params.query);
      const apiKey = process.env.JINA_API_KEY;
      const url = \`https://s.jina.ai/\${encodeURIComponent(query)}\`;
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "pi-daytona-chat/1.0",
            ...(apiKey ? { Authorization: \`Bearer \${apiKey}\` } : {}),
          },
        });
        const text = await response.text();
        return textResult({
          ok: response.ok,
          result: limitText(text),
          metadata: {
            query,
            url,
            status: response.status,
            statusText: response.statusText,
            length: text.length,
            truncated: text.length > 12000,
          },
        });
      } catch (error) {
        return textResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  });

  pi.registerTool({
    name: "write_json_note",
    label: "Write JSON Note",
    description: "Internal helper for structured notes. Prefer write for normal file writes.",
    parameters: Type.Object({
      path: Type.String(),
      data: Type.Any(),
    }),
    async execute(_toolCallId, params) {
      try {
        const filePath = path.resolve(String(params.path));
        await writeFile(filePath, JSON.stringify(params.data, null, 2));
        const written = await readFile(filePath, "utf8");
        return textResult({ ok: true, result: { path: filePath, bytes: written.length } });
      } catch (error) {
        return textResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}
`,
  },
];
