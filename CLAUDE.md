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
