# log-orchestration — Strategy & Architecture

*Last updated: 2026-06-11*

---

## 1. Product Vision

log-orchestration is a spatial canvas workspace where all work lives in one place. Think FigJam's infinite canvas, GoodNotes' freehand drawing, and a universal AI chat interface — fused into a single surface.

The canvas holds **artifacts**: chats, projects, notes, and sketches. Each artifact is a card on the canvas. Cards can be opened, expanded, and interacted with. A chat opens into a full conversation window. A project opens to show Linear status, linked issues, and associated chats. A note opens for typed or drawn writing. A sketch — a freehand drawing made directly on the canvas — opens to a contextual action palette where you can summarise it, create a conversation from it, generate an image, or add it to a project.

The canvas itself is drawable. You are always one stroke away from capturing an idea spatially, and that drawing is immediately a first-class artifact with the same standing as a chat or a project.

**Linking is the core mechanic.** Artifacts connect in two ways: explicitly, by dragging one onto another (a chat dragged into a project takes its context with it), and implicitly, through auto-generated tags that model-scanning discovers — semantic similarity between a brain-dump chat and a design note, for instance. These relationships are rendered as **lines of force** on the canvas. Direct links are strong, solid lines. Semantic connections are softer, thinner. The canvas is not just a workspace; it is a map of how your thinking connects.

Every artifact is an agent entrypoint. Open any card and a model is available, pre-loaded with the context of that artifact and everything linked to it. The system is model-agnostic: Claude, GPT, Gemini, and locally-hosted models via Ollama all speak through the same proxy interface.

---

## 2. Hosting and Deployment Stack

### Environments

Three environments: **local dev** (your machine), **staging** (Fly.io + Vercel preview), and **production** (Fly.io + Vercel).

Local dev runs the Vite dev server for the frontend and a local Node server for the backend proxy. SQLite is the database locally. No Postgres is needed unless testing sync explicitly.

Staging maps to a `staging` app on Fly.io and a Vercel preview deployment triggered by pushes to the `staging` branch. It points at a separate Postgres instance on Fly.io (not production data).

Production deploys from `main`. Merges to `main` trigger a Vercel production deployment (frontend) and a `fly deploy` via GitHub Actions (backend).

### Frontend — Vercel

The Vite/React build produces a static bundle. Vercel serves it from its CDN with zero configuration beyond `vercel.json` for environment variable injection. Preview URLs are generated automatically for every PR, which matters when the UI is a canvas — reviewers can interact with the actual thing.

Vercel environment variables: `VITE_API_URL` (points at the Fly.io backend), `VITE_ENV`.

### Backend — Fly.io

The Node/TypeScript backend runs as a single Fly.io app, co-located with the ChatEmail backend to share the same Fly.io organisation and billing. It handles:

- The inference proxy (all model API calls go through here; API keys never leave the server)
- Auth (magic-link email, session tokens, JWT validation)
- The sync endpoint (local SQLite → Postgres backup)
- Tag computation (scheduled model scans for semantic linking)

Postgres runs as a Fly.io managed database attached to the backend app. One instance per environment.

### CI/CD Pipeline

GitHub Actions runs three jobs on every push: `build` (Vite build must pass), `bench` (the 500-object fps gate in `scripts/bench.js` — PEO-113), and `eval-links` (link-trust evaluation in `scripts/eval-links.js` — PEO-121, currently a placeholder). All three must pass before merge.

Deployment is gated on CI passing. Vercel auto-deploys from Vercel's GitHub integration. The Fly.io deployment is a manual `fly deploy` step in the Actions workflow, triggered only on pushes to `staging` and `main`.

---

## 3. Dev Stack

**Frontend:** Vite + React 18 + TypeScript + tldraw SDK v3. tldraw is the canvas layer; React components render inside tldraw shapes via the custom shape API. TypeScript throughout — no JavaScript in source.

**Backend:** Node 20 + TypeScript, compiled with `tsc`. Express for routing (lightweight, familiar, adequate for a single-user API proxy). No framework beyond that.

**Database (local):** SQLite via `better-sqlite3`. Synchronous API is fine for a single-user app and keeps the data layer simple.

**Database (cloud):** Postgres 16 on Fly.io, accessed via `pg` (node-postgres). Schema is identical to SQLite where possible; Postgres-specific types only where necessary.

**Auth:** Magic-link email. User enters email, receives a one-time link, clicks it, gets a session token (JWT, 30-day expiry). No passwords. Resend or Postmark for transactional email delivery — decision deferred to PEO-116.

**Model proxy:** A thin adapter layer. Each model provider implements one interface: `{ complete(messages, options): AsyncIterable<string> }`. Adding a new provider is adding a new file. Streaming is first-class; all completions stream.

**Local models:** Ollama. The proxy detects whether the request targets a local model identifier (e.g. `ollama/llama3`) and routes to `localhost:11434` instead of a remote API. This only works in local dev; local model support is not available in the deployed app (PEO-118 will address this properly via a local relay service).

**Tooling:** ESLint + Prettier, Vitest for unit tests, Playwright for end-to-end canvas interaction tests.

---

## 4. Data Architecture

### SQLite Schema (local)

The core tables:

```sql
artifacts (
  id TEXT PRIMARY KEY,         -- ulid
  type TEXT NOT NULL,          -- 'chat' | 'project' | 'note' | 'sketch'
  title TEXT,
  content TEXT,                -- JSON blob: messages[], drawing strokes, note body
  canvas_x REAL, canvas_y REAL, canvas_w REAL, canvas_h REAL,
  created_at INTEGER, updated_at INTEGER,
  synced_at INTEGER            -- null if not yet backed up
)

artifact_links (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES artifacts(id),
  target_id TEXT REFERENCES artifacts(id),
  strength REAL NOT NULL,      -- 1.0 = explicit drag link; 0.0–0.99 = semantic weight
  link_type TEXT,              -- 'explicit' | 'semantic' | 'tag'
  tags TEXT,                   -- JSON array of tag strings
  created_at INTEGER
)

memory_entries (
  id TEXT PRIMARY KEY,
  artifact_id TEXT REFERENCES artifacts(id),
  embedding_model TEXT,        -- which model produced the embedding
  content TEXT,                -- the summarised/distilled content
  embedding BLOB,              -- float32 array, stored as blob
  created_at INTEGER
)
```

`artifact_links.strength` is what drives lines-of-force rendering. Explicit drag links always get `1.0`. Semantic links get a score between 0 and 1 based on embedding cosine similarity, thresholded at 0.5 before being stored.

### Postgres Backup

Postgres mirrors the SQLite schema exactly. The sync endpoint accepts a batch of changed rows (identified by `updated_at > synced_at`) and upserts them. Conflicts resolve by `updated_at` (last write wins — acceptable for a single-user system). After a successful sync, `synced_at` is updated locally.

Sync runs on a timer (every 5 minutes when the app is open) and on app close.

### Memory Context Layer

The memory layer is the shared context store that any model reads at inference time. When an artifact is opened:

1. Retrieve the artifact's content and all linked artifacts (via `artifact_links`, ordered by strength descending, capped at the top 10 links).
2. Query `memory_entries` for the artifact and its top links. These are pre-distilled summaries — not raw content — that fit compactly into a context window.
3. Assemble the context block: artifact content + linked artifact summaries + relevant memory entries.
4. Pass to the model adapter as a system message.

Memory entries are generated by a background job that runs a lightweight summarisation pass over each artifact using the cheapest available model. They are regenerated when `updated_at` changes significantly. The format is plain text — no provider-specific structure.

---

## 5. AI / Agent Runtime Architecture

### Model Adapter Interface

```typescript
interface ModelAdapter {
  id: string;                   // e.g. 'claude-sonnet-4-6', 'gpt-4o', 'ollama/llama3'
  complete(
    messages: Message[],
    options: CompletionOptions
  ): AsyncIterable<string>;
}
```

The backend proxy instantiates the correct adapter based on the model ID in the request. API keys are stored as Fly.io secrets, never sent to the client.

### Context Assembly

When a user opens an artifact and invokes the model:

1. Client sends `{ artifactId, modelId, userMessage }` to `POST /inference`.
2. Backend loads the artifact from Postgres (or accepts it from the client payload if not yet synced).
3. Loads linked artifacts sorted by strength, taking the top 10.
4. Loads memory entries for the artifact and top links.
5. Builds a system prompt: identity + memory entries + artifact context + linked artifact summaries.
6. Calls the adapter, streams the response back to the client via SSE.

### Lines of Force

The canvas renders `artifact_links` as SVG lines between artifact card positions. Strength maps to line opacity and weight: `1.0` → thick solid line, `0.5` → thin translucent line, below `0.5` → not rendered (stored but hidden by default). A toggle on the canvas shows or hides semantic links independently from explicit links.

### Tag Generation

Tags are generated by a background job triggered after each artifact is saved or significantly modified. The job calls the configured model with the artifact content and a structured prompt requesting a JSON array of tags. Tags are stored in `artifact_links.tags` for explicit links and in a separate `artifact_tags` table for the artifact itself. Semantic links are computed by comparing embeddings: the job embeds each artifact using a small embedding model, then finds neighbors above the 0.5 threshold and creates or updates `artifact_links` records accordingly.

---

## 6. Multi-Agent Build Orchestration

### Design Principles

Claude acts as the **supervisor**. The supervisor never writes code. It reads Linear, decides which issue to work on next, assembles context, spawns a specialist agent, and reviews the result. Linear is the single source of truth for work state — an issue's status in Linear is the canonical record of what has been built. Agents that hit ambiguity return `blocked` with a reason rather than guessing.

### Agent Roles

**Supervisor (Claude, Dispatch):** Reads the active milestone from Linear, selects the next `Todo` issue, assembles the brief (issue description + relevant files + CLAUDE.md + PIPELINE.md), spawns the appropriate specialist, reviews the output, and updates Linear.

**Scaffolder:** Writes boilerplate — directory structure, config files, CI jobs, package.json. Used once at project start (PEO-114, done) and for each new major module. Does not implement logic.

**Feature agent:** Implements a single Linear issue. Receives a brief specifying the issue, acceptance criteria, relevant files, and the existing codebase shape. Returns a diff and a test result. Works in a git worktree so its changes are isolated.

**Reviewer agent:** Reviews a feature agent's diff against the acceptance criteria and the style of the existing codebase. Returns `approved`, `changes-requested`, or `blocked`. Does not write code.

**Strategy reviewer:** Reads planning documents (PRE-REVIEW.md, PIPELINE.md, Linear project state) and produces a verdict: proceed, amend, or block. Used at the start of each milestone.

### Handoff Protocol

1. Supervisor reads Linear for the next `Todo` issue in the active milestone.
2. Supervisor writes a brief: issue title, description, acceptance criteria, files to read, constraints.
3. Supervisor spawns a feature agent with the brief and the repo path.
4. Feature agent implements, runs tests, returns diff + test output.
5. Supervisor spawns reviewer agent with the diff + brief.
6. Reviewer returns verdict. If `approved`, supervisor commits and updates Linear to `Done`. If `changes-requested`, supervisor sends feedback to the feature agent (up to 2 retry cycles). If `blocked`, supervisor surfaces the blocker to the user.
7. Supervisor moves to the next issue.

At no point does the supervisor synthesise or guess on ambiguous requirements. Any open question goes to the user before work proceeds.

### Linear Integration

Issues must have: a `type` label (`feature`, `scaffold`, `research`, `adr`), acceptance criteria in the description (a checklist), and a milestone assignment. The supervisor will not pick up an issue missing any of these. The CI workflow validates that merged code corresponds to a `Done` issue.

---

## 7. Issue Loop and Milestones

The current issue sequence, per PIPELINE.md:

**PEO-110 — tldraw validation (In Progress)**
Two-day spike: confirm 500-object canvas performance, DOM overlay feasibility for card expansion, ink-layer support for freehand drawing. Produces a benchmark result and a go/no-go recommendation. If no-go, PEO-111 evaluates an alternative canvas library.

**PEO-111 — Canvas library decision**
Contingent on PEO-110. If tldraw passes, this closes as won't-do. If it fails, evaluates alternatives (Excalidraw, Konva, custom WebGL).

**PEO-112 / PEO-113 — Core artifact rendering + performance gate**
Implements the four artifact card types as tldraw custom shapes. PEO-113 is the 500-object fps gate that CI enforces.

**PEO-115 / PEO-116 — Auth and deployment**
PEO-115: magic-link auth, JWT sessions. PEO-116: full Fly.io + Vercel deployment pipeline, environment variables, secrets, staging environment.

**Milestone 1 (M1):** Canvas renders all four artifact types. Auth works. App is deployed to staging. No data persistence yet.

**PEO-118 — Memory and inference proxy**
Model adapter layer, context assembly, streaming, SQLite schema, local Ollama routing.

**PEO-120 / PEO-121 — Tag generation and link-trust eval**
PEO-120: embedding-based semantic linking, tag generation job. PEO-121: link-trust evaluation (the `eval-links.js` CI gate gets its real implementation here).

**Milestone 2 (M2):** Full artifact canvas with persistence, semantic linking, model inference on any artifact, deployed to production.

---

## 8. Open Decisions

**Memory format (before PEO-118).** The memory entry format is currently plain text. Before implementing PEO-118, decide whether to add a structured envelope (e.g. typed fields for tags, timestamps, artifact type) or keep it unstructured. Structured is easier to query; unstructured is simpler to generate. Recommendation: a light envelope with `type`, `artifact_id`, and `content` fields — enough to filter without over-engineering.

**Auth provider (before PEO-116).** Magic-link requires a transactional email provider. The two candidates are Resend (modern API, generous free tier) and Postmark (more established, better deliverability reputation). Either works. Decide before PEO-115 begins.

**Ollama routing in production (before PEO-118).** Local models work in dev but not in the deployed app — the server cannot reach `localhost:11434` on the user's machine. The solution is a local relay service (a small process running on the user's machine that forwards requests from the deployed backend to local Ollama). This is non-trivial; it needs to be scoped properly before PEO-118.

**Sync conflict strategy.** Last-write-wins is acceptable for a single user but will break if the app is ever opened on two devices simultaneously. A vector clock or `updated_at`-based merge strategy should be evaluated before M2 if multi-device use becomes common.

**Sketch-to-image pipeline.** The "create image" action on a sketch artifact is not yet scoped. It requires either sending the sketch SVG/PNG to an image model (DALL-E 3, Stable Diffusion) or using a describe-then-generate approach. Scope this before PEO-120.
