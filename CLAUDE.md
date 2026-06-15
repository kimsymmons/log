# log — spatial canvas workspace

tldraw v3 canvas + Express/SQLite backend. Tests: `npm test` (Vitest; jsdom for src/, node for server/). Perf gate: `npm run bench` (P90 ≥ 55fps, also enforced in CI).

## Current data model

**Canonical ChatCard shape props** (`src/shapes/ChatCard.tsx`, validated by tldraw at runtime):

```typescript
{ w: number, h: number, title: string, messages: Message[], summary: string, createdAt: number /* epoch ms */ }
```

- NOT `body`, NOT `timestamp`. Those names exist ONLY in the LogNode model (`src/model/nodes.ts`: `ChatNode.body`, `ChatNode.timestamp` ISO string) and are bridged exclusively in `src/model/tldraw-adapter.ts` (`summary ↔ body`, `createdAt ↔ timestamp`). Never use node-model field names in shape props or vice versa — this drift broke main during the M1 merges.
- Anything that calls `editor.createShapes` with a `chat-card` (tests, `scripts/bench*.js`, `scripts/e2e-persistence.js`) must use the shape prop names or validation throws.

**Artifact shapes** (`src/shapes/ArtifactShapes.tsx`): `markdown-artifact` | `code-artifact` | `image-artifact`, shared props `{ w, h, chatId, content, title }`. `chatId` ties an artifact to its parent ChatCard (tether + follow-on-drag).

**Two distinct type families in `src/types/artifact.ts`** — don't conflate:
- `ArtifactType` = `'chat' | 'project' | 'note' | 'sketch'` — DB domain type (`artifacts` table rows)
- `ArtifactShapeType` = `'markdown' | 'code' | 'image'` — canvas shape discriminator (SSE payloads)

## Testing

Two-layer approach: Vitest for units/integration, Playwright for E2E.

**Vitest** (`npm test`): fast, runs in-process. Use for pure functions, state machines, server route handlers (inject `createApp(db, mockAnthropic)`), React component logic. jsdom env for `src/`, node env for `server/`.

**Playwright** (`npx playwright test`): full browser. **Required for any ticket that touches canvas rendering, pointer events, tldraw internals, ink layer, or auth flows.** Specs live in `e2e/`. Mock all backend calls with `page.route()` — specs must not need a live server. The `webServer` block in `playwright.config.ts` starts `npm run dev` automatically.

**TDD workflow for new features**: write Vitest tests for pure logic first, Playwright spec for the user-visible behaviour, then implement.

**Do not `vi.mock('@anthropic-ai/sdk')`** — async generators break in Vitest node env. Use `createApp(db, anthropicOverride)` injection instead.

## Server conventions

- `createApp(db, anthropicOverride?)` — tests inject a mock Anthropic client; never `vi.mock('@anthropic-ai/sdk')` (async generators break in Vitest node env).
- `ANTHROPIC_API_KEY` only via `process.env`. Never hardcode keys.
- DB migrations in `server/db.ts` are additive only (`ALTER TABLE ADD COLUMN`, `CREATE INDEX IF NOT EXISTS`).
- Inference spend logs to `inference_log` with a `feature` discriminator (`'linking'`, or the artifactId for chat inference).

## Model selection (for Dispatch orchestrator)
- Feature implementation, design interpretation, complex architecture: claude-opus-4-8
- Merges, test fixes, small patches, config changes: claude-haiku-4-5-20251001
- Code review: claude-opus-4-8

## Visual regression harness

`e2e/visual-baseline.spec.ts` (full-page chrome) and `e2e/visual/*.spec.ts`
(component-level: thread card, connection line, filter bar, toolbar, zoom pill)
capture screenshots against `BASE_URL`.
- **Where the baselines live:** committed PNGs in a `<spec>.spec.ts-snapshots/`
  dir next to each spec, named `<name>-chromium-darwin.png` (per-platform — a
  Linux CI run produces different files, so regenerate on macOS).
- Auth: `e2e/global-setup.ts` exchanges `TEST_BYPASS_TOKEN` for a JWT via the
  backend `POST /auth/test-token` (set `TEST_API_URL` for a non-local backend),
  writing `e2e/.auth/token.json`. Specs seed it into `localStorage.auth_token`.
  (When `TEST_BYPASS_TOKEN` is unset, specs run unauthenticated; the visual
  specs mock `**/artifacts**` → `[]` and seed their own shapes, so they don't
  need a live backend.)
- **Test your branch, not production:** `BASE_URL` defaults to the deployed app
  (`https://log-five-xi.vercel.app`). For local changes you MUST pass
  `BASE_URL=http://localhost:5173` or you're baselining production. Have a dev
  server running or let the `webServer` block start one.
- **Regenerate** after an intentional UI change (covers both dirs):
  `BASE_URL=http://localhost:5173 npx playwright test e2e/visual-baseline.spec.ts e2e/visual --update-snapshots`,
  then re-run without `--update-snapshots` to confirm green, and eyeball the new
  PNGs. Gotcha: `--update-snapshots` occasionally won't rewrite a file it deems
  unchanged — if a baseline looks stale, `rm` the PNG and re-run to force it.
- **Vite dev-reload gotcha:** the first page load (and the first use of tldraw's
  `draw` tool) triggers a one-time Vite dep re-optimization that reloads the
  page and kills any in-flight `page.evaluate` ("Execution context was
  destroyed"). Gate readiness with navigation-resilient `page.waitForFunction(...)`
  (it re-evaluates after the reload) rather than bare `evaluate`, and settle
  before driving the editor. For draw-tool flows, test against a production
  preview (`npx vite build && npx vite preview --port 4173`, `BASE_URL=…:4173`)
  which pre-bundles everything and never reloads. NB: `vite build` wipes `dist/`,
  including the server's CJS marker — re-add `dist/server/package.json`
  `{"type":"commonjs"}` before running the built backend.
- **Viewing the seeded app manually:** the canvas silently renders nothing
  without auth — `localStorage.setItem('auth_token', <jwt>)` then reload. Mint a
  jwt with the backend `POST /auth/test-token` (needs `TEST_BYPASS_TOKEN`).

## PR review process

Before every merge:
1. Run `npm test` + `tsc` — must be clean
2. Start the app locally, screenshot it, check the visual audit checklist (see memory)
3. Run `npm run test:e2e` — includes visual regression tests
4. No raw hex values in changed files — CSS variables only (tokens.css is the one
   place hex is defined; everything else uses `var(--token)`)
5. tldraw default chrome must be hidden; custom chrome must match design spec positions

Visual audit checklist covers: nav/shell, canvas inset, dot grid, tldraw UI hidden, filter bar pills, toolbar, zoom pill font (--font-mono), card typography, surface colours.

**What "passing" means — the hard gate is `npm test` + `tsc`.**
- `tsc` means BOTH configs: `npx tsc --noEmit` (front-end, `tsconfig.json`) AND
  `npx tsc --project tsconfig.server.json --noEmit` (server). The default `tsc`
  only checks the front end.
- The **visual-regression specs** (`e2e/visual-baseline.spec.ts` + `e2e/visual`)
  must pass locally; regenerate + eyeball their baselines for any intentional UI
  change (see Visual regression harness above).
- The **full `npm run test:e2e` suite is environmentally flaky in CI** (auth,
  links, musing, bench specs fail on infra, not code) — a red full-suite run does
  NOT block a merge. The gate is: vitest green, both `tsc`s clean, the visual
  specs green, and the manual visual-audit checklist. Don't chase green on the
  whole e2e suite.
