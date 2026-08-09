# Pi Daytona Chat

Minimal TypeScript chatbot system for the Agentic Institute systems design assessment.

The app demonstrates a control-plane UI/backend that creates one isolated Daytona environment per conversation, bootstraps a Pi Agent runtime inside that environment, sends chat turns into it, and stores message/tool/session history in Convex.

## Task Compliance Checklist

- [x] TypeScript implementation.
- [x] React chat UI with no authentication.
- [x] Start a new conversation/thread from the UI.
- [x] Send user messages and receive assistant messages.
- [x] Progressive assistant updates are persisted where Pi emits deltas.
- [x] Each conversation creates its own dedicated Daytona session.
- [x] Daytona session ID and runtime state are stored per thread.
- [x] Pi Agent runtime is bootstrapped inside the Daytona environment.
- [x] Chat turns execute by running `node run-turn.mjs` inside the thread's Daytona environment.
- [x] Control plane is separate from execution plane.
- [x] Convex handles database, backend API logic, and Daytona orchestration.
- [x] Message history is stored in Convex.
- [x] Tool execution history is stored in Convex.
- [x] Tool execution order is stored by sequence.
- [x] Tool names, inputs, outputs, and statuses are observable in the UI.
- [x] Session-to-thread mapping is stored in Convex.
- [x] Required tool allowlist is passed to Pi: `bash`, `read`, `write`, `edit`, `grep`, `glob`, `webfetch`, `websearch`.
- [x] `glob`, `webfetch`, and `websearch` are added through a Pi extension inside Daytona.
- [x] Tool outputs are handled as structured Pi events and persisted.
- [x] Streaming/event timeline is stored in `streamEvents`.
- [x] Generated artifacts are detected inside Daytona and attached to the assistant turn that created them.
- [x] Artifacts can be downloaded from the response and from the right artifact drawer.
- [x] Conversation rename and delete are supported.
- [x] No authentication or user management.
- [x] All required env variables are documented below.
- [x] Build passes with Node 22.
- [x] Lint passes, with only Convex generated-file warnings.
- [ ] Cap demo link is not part of this repository and must be recorded/submitted separately.

Important Daytona note: the implementation supports strict VM mode when `DAYTONA_SNAPSHOT` is set to an available Linux VM snapshot. For the tested free Daytona account, shared Linux VM snapshots were not instantiable in the available targets, so the default path uses Daytona's TypeScript sandbox/session API. The architectural boundary remains the same: one isolated Daytona environment per conversation, with Pi and tools running inside that environment.

## Architecture

There are two planes.

Control plane:

- React UI.
- Convex database.
- Convex queries, mutations, and Node actions.
- Daytona SDK calls for session lifecycle and command execution.

Execution plane:

- One Daytona environment per conversation thread.
- Bootstrapped runtime under `workspace/agent-runtime`.
- Pi Agent process running inside that Daytona environment.
- Tool execution inside Daytona, not in the browser or directly in Convex.

Turn flow:

1. User creates a new conversation.
2. Convex creates a `threads` row with `creating` status.
3. Convex calls Daytona and creates one environment for that thread.
4. Convex uploads the runtime files from `convex/runtimeSource.ts`.
5. Daytona installs runtime dependencies and verifies Pi.
6. Thread becomes `ready`.
7. User sends a message.
8. Convex stores the user message and creates an assistant placeholder.
9. Convex executes `node run-turn.mjs <payload>` inside that thread's Daytona environment.
10. Pi runs with OpenRouter credentials and the required tool allowlist.
11. Pi JSON events are parsed and persisted into messages, tool calls, and stream events.
12. New or changed files in Daytona are detected and stored as artifacts for that turn.

## Data Model

Convex tables:

- `threads`: conversation title, status, Daytona session ID/name, runtime status, errors.
- `messages`: user and assistant messages, streaming status, turn IDs.
- `sessions`: Daytona session metadata, runtime type, region, bootstrap state.
- `toolCalls`: tool name, input, output, status, execution sequence, timestamps.
- `streamEvents`: assistant deltas, tool events, status updates, errors.
- `artifacts`: generated file metadata attached to `threadId` and `turnId`.

## Repository Layout

```text
src/
  App.tsx              React UI, chat timeline, sidebar, artifact drawer
  App.css              Light-mode app styling and pane layout
  index.css            Global variables and viewport locking

convex/
  schema.ts            Convex tables and indexes
  daytona.ts           Daytona session lifecycle actions
  daytonaClient.ts     Daytona SDK client, runtime env, bootstrap, artifact scan
  agent.ts             Run one Pi turn inside Daytona and persist events
  runtimeSource.ts     Files uploaded into Daytona runtime
  messages.ts          Message queries/internal mutations
  toolCalls.ts         Tool log queries/internal mutations
  streamEvents.ts      Event log queries/internal mutations
  sessions.ts          Daytona session metadata
  artifactRecords.ts   Artifact record query/internal mutation
  artifacts.ts         Artifact scan/download actions
```

## Environment Variables

Frontend `.env.local`:

```bash
VITE_CONVEX_URL=
```

Convex backend environment:

```bash
DAYTONA_API_KEY=
DAYTONA_API_URL=https://app.daytona.io/api
DAYTONA_TARGET=us
DAYTONA_SNAPSHOT=
OPENROUTER_API_KEY=
MODEL_ID=
JINA_API_KEY=
```

Required:

- `DAYTONA_API_KEY`
- `OPENROUTER_API_KEY`
- `MODEL_ID`
- `VITE_CONVEX_URL`

Usually set:

- `DAYTONA_API_URL=https://app.daytona.io/api`
- `DAYTONA_TARGET=us`

Optional:

- `DAYTONA_SNAPSHOT`: set this only when your Daytona account/target can create the named Linux VM snapshot.
- `JINA_API_KEY`: only needed for higher web search/fetch limits.

Set Convex env vars:

```bash
npx convex env set DAYTONA_API_KEY "your-daytona-api-key"
npx convex env set DAYTONA_API_URL "https://app.daytona.io/api"
npx convex env set DAYTONA_TARGET "us"
npx convex env set OPENROUTER_API_KEY "your-openrouter-api-key"
npx convex env set MODEL_ID "your-openrouter-model-id"
```

Optional:

```bash
npx convex env set DAYTONA_SNAPSHOT "your-linux-vm-snapshot"
npx convex env set JINA_API_KEY "your-jina-key"
```

Do not set optional variables to empty strings. Leave them unset when unused.

## Local Setup

Use Node 22. On Pop!_OS or Ubuntu with `nvm`:

```bash
source "$HOME/.nvm/nvm.sh"
nvm install 22
nvm use 22
node -v
npm -v
```

Install dependencies:

```bash
npm install
```

Create or update `.env.local`:

```bash
printf 'VITE_CONVEX_URL=your-convex-url\n' > .env.local
```

Generate Convex bindings:

```bash
npx convex codegen
```

Run Convex locally:

```bash
npx convex dev
```

In another terminal, run Vite:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

If that port is already in use, Vite will choose another port.

## Verification Commands

Run these before submitting:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22
npx convex codegen
npm run build
npm run lint
```

Expected result:

- `npm run build` passes.
- `npm run lint` passes, but may print warnings from Convex generated files such as unused `eslint-disable` directives.

## Daytona Runtime Modes

Default mode:

- Uses `daytona.create({ language: "typescript", ... })`.
- Works with the tested free Daytona account.
- Still creates one isolated Daytona session per thread.

Strict VM mode:

- Set `DAYTONA_SNAPSHOT` to an available Linux VM snapshot.
- The same runtime bootstrap and turn execution flow is used.
- This is the mode to use if the evaluator requires Daytona VM terminology literally.

Tested VM limitation on the current Daytona account:

```text
Snapshot daytona-vm-small is not available in region us
Snapshot daytona-vm-small is not available in region eu
```

Because of that account limitation, the repository keeps the free-account sandbox path as the default so the assessment app remains runnable.

## UI Notes

The UI is intentionally a consumer-facing light-mode chat app:

- Left sidebar lists conversations and supports rename/delete.
- Main chat pane renders markdown assistant responses.
- Work details are collapsible and auto-collapse when the assistant response completes.
- Tool details are shown as readable progress summaries instead of raw JSON blocks.
- Composer is fixed to the visible viewport bottom with a blur scrim behind it.
- Right artifact drawer lists all artifacts and supports individual or bulk download.
- Artifact cards remain attached to the assistant response that generated them.
- Error messages appear as dismissible auto-expiring toasts.
- Left sidebar, main chat, and right artifact drawer scroll independently.

## Tradeoffs

- Daytona command execution currently persists Pi JSON events after the Daytona command returns. The data model already separates `messages`, `toolCalls`, and `streamEvents`, so a future SDK streaming API can be connected without redesigning storage.
- Conversation history is authoritative in Convex and sent to Pi on each turn. Daytona also keeps the per-thread filesystem and Pi session files.
- Web search uses a small Pi extension backed by Jina search. Add `JINA_API_KEY` only if unauthenticated limits are not enough.
- Authentication, user management, quota controls, and production hardening are intentionally omitted because they are non-goals in `Task.md`.

## Demo Checklist

For the Cap demo, show:

1. Create a new conversation.
2. Confirm a Daytona session appears in the header.
3. Ask the agent to create a file, for example a PDF/report/script.
4. Open Work details and show tool execution history.
5. Download the generated artifact from the assistant response.
6. Open the right artifact drawer and download from there.
7. Rename and delete a conversation from the left sidebar.
