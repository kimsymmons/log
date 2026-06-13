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

`e2e/visual-baseline.spec.ts` captures canvas screenshots against `BASE_URL`
(default `https://log-five-xi.vercel.app`; override with `BASE_URL=http://localhost:5173` to test locally).
- Auth: `e2e/global-setup.ts` exchanges `TEST_BYPASS_TOKEN` for a JWT via the
  backend `POST /auth/test-token` (set `TEST_API_URL` for a non-local backend),
  writing `e2e/.auth/token.json`. Specs seed it into `localStorage.auth_token`.
- Refresh baselines: `npx playwright test e2e/visual-baseline.spec.ts --update-snapshots`.
- Component-level visuals live in `e2e/visual/` (thread card, connection line, filter bar, toolbar, zoom pill).

## PR review process

Before every merge:
1. Run `npm test` + `tsc` — must be clean
2. Start the app locally, screenshot it, check the visual audit checklist (see memory)
3. Run `npm run test:e2e` — includes visual regression tests
4. No raw hex values in changed files — CSS variables only
5. tldraw default chrome must be hidden; custom chrome must match design spec positions

Visual audit checklist covers: nav/shell, canvas inset, dot grid, tldraw UI hidden, filter bar pills, toolbar, zoom pill font (--font-mono), card typography, surface colours.
