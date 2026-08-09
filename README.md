# Pi Daytona Chat

Minimal TypeScript chatbot for the systems design assessment.

The system uses React for the UI, Convex for backend/database state, Daytona for isolated per-thread compute, and Pi Agent running inside each Daytona environment. OpenRouter is the LLM provider through `OPENROUTER_API_KEY` and `MODEL_ID`.

## Requirement Status

- [x] TypeScript app.
- [x] Basic chat UI with no authentication.
- [x] Start conversations and send/receive messages.
- [x] One Daytona session is created per conversation thread.
- [x] Pi runtime is installed and executed inside Daytona.
- [x] Convex stores conversations, messages, tool logs, session mappings, stream events, and artifacts.
- [x] Tool observability includes tool name, input, output, status, and execution order.
- [x] Required tools are exposed to Pi: `bash`, `read`, `write`, `edit`, `grep`, `glob`, `webfetch`, `websearch`.
- [x] Generated files are attached to the assistant response that created them and can be downloaded.
- [x] Local setup, architecture, tradeoffs, and env variables are documented here.

## Architecture Decisions

The app is split into two planes:

- **Control plane:** React UI plus Convex queries, mutations, actions, and database tables.
- **Execution plane:** a dedicated Daytona environment for each conversation, containing the Pi runtime and tool execution context.

Convex is the source of truth for application state. Daytona is the execution boundary. The browser never runs agent tools, and Convex does not directly perform user-requested filesystem or shell work; it only provisions Daytona, sends turns into Daytona, and persists the structured events returned by Pi.

Each conversation maps to exactly one Daytona session. The session ID is stored on the `threads` row and in the `sessions` table. This keeps conversation history, filesystem state, and generated artifacts isolated by thread.

## How Components Interact

1. The UI calls `api.daytona.createThreadSession`.
2. Convex creates a `threads` row, calls Daytona, uploads the runtime from `convex/runtimeSource.ts`, installs dependencies, and verifies Pi.
3. The user sends a message through the UI.
4. Convex stores the user message and creates a streaming assistant placeholder.
5. Convex runs `node run-turn.mjs <payload>` inside that thread's Daytona session.
6. The Daytona runtime starts Pi with OpenRouter credentials and the required tool allowlist.
7. Pi emits JSON events for message deltas and tool execution.
8. Convex parses those events into `messages`, `toolCalls`, and `streamEvents`.
9. Convex scans the Daytona workspace before/after the turn and records new or changed files in `artifacts`.
10. The UI subscribes to Convex and renders messages, work details, and artifact download cards.

## Data Stored In Convex

- `threads`: conversation title, status, Daytona session ID/name, runtime status, errors.
- `sessions`: Daytona session metadata and bootstrap status.
- `messages`: user/assistant messages and turn IDs.
- `toolCalls`: tool name, input, output, status, execution order, timestamps.
- `streamEvents`: assistant deltas, tool events, status updates, errors.
- `artifacts`: generated file metadata linked to `threadId` and `turnId`.

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

- `VITE_CONVEX_URL`
- `DAYTONA_API_KEY`
- `OPENROUTER_API_KEY`
- `MODEL_ID`

Usually set:

- `DAYTONA_API_URL=https://app.daytona.io/api`
- `DAYTONA_TARGET=us`

Optional:

- `DAYTONA_SNAPSHOT`: use only when the Daytona account/target has an available Linux VM snapshot.
- `JINA_API_KEY`: use only for higher Jina web search/fetch limits.

Convex may also generate local deployment values such as `CONVEX_DEPLOYMENT`; those are Convex project metadata, not app-specific secrets.

Set backend variables with:

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

Do not set optional variables to empty strings.

## Local Setup

Use Node 22:

```bash
source "$HOME/.nvm/nvm.sh"
nvm install 22
nvm use 22
```

Install dependencies:

```bash
npm install
```

Generate Convex bindings:

```bash
npx convex codegen
```

Run Convex:

```bash
npx convex dev
```

Run Vite in another terminal:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`.

## Verification

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22
npx convex codegen
npm run build
npm run lint
```

Current status:

- `npm run build` passes.
- `npm run lint` passes with only Convex generated-file warnings about unused `eslint-disable` directives.

## Daytona Runtime Note

The implementation supports two Daytona runtime paths:

- Default free-account path: `daytona.create({ language: "typescript", ... })`.
- Strict VM path: set `DAYTONA_SNAPSHOT` to an available Linux VM snapshot.

The tested Daytona account could list VM snapshots but could not instantiate the shared Linux VM snapshots in the available targets. For example:

```text
Snapshot daytona-vm-small is not available in region us
Snapshot daytona-vm-small is not available in region eu
```

For that reason, the default path keeps the app runnable on the free Daytona account while preserving the core architecture: one isolated Daytona environment per conversation, with Pi and tools running inside Daytona.

## Tradeoffs

- Daytona command output is persisted after command completion on the SDK path used here. Pi still emits structured JSON events, so the Convex model can support a lower-latency streaming API later without schema changes.
- Convex stores authoritative chat/tool/session history; Daytona stores per-thread filesystem and Pi runtime state.
- `glob`, `webfetch`, and `websearch` are implemented as a small Pi extension inside Daytona instead of adding another external service layer.
- The UI includes more polish than the non-goals require, but authentication, user management, quota controls, and production hardening are intentionally omitted.

## Repository Map

```text
src/App.tsx              React chat UI and artifact drawer
src/App.css              App layout and component styling
src/index.css            Global CSS and viewport locking
convex/schema.ts         Convex tables
convex/daytona.ts        Daytona lifecycle actions
convex/daytonaClient.ts  Daytona client, env, bootstrap, artifact scan
convex/agent.ts          Runs Pi turn inside Daytona and persists events
convex/runtimeSource.ts  Runtime files uploaded to Daytona
convex/artifacts.ts      Artifact scan/download actions
```
