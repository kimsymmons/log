# Agent Handoff Guide

This document tells an AI agent (or a new human engineer) everything needed to pick up work on this repo without reading the full git history.

---

## What this project is

**log** — a spatial canvas workspace. Users place chat cards on an infinite tldraw canvas, have AI conversations inside them, and the system automatically draws semantic links between related cards.

Stack: tldraw v3 (canvas) + React (frontend) + Express + better-sqlite3 (backend) + Anthropic API (inference).

---

## Critical invariants — do not break these

### Shape props vs node model naming

Two field-name families exist and must never cross:

| Where | Field names |
|-------|-------------|
| ChatCard shape props (tldraw, `src/shapes/ChatCard.tsx`) | `summary`, `createdAt` (epoch ms) |
| LogNode model (`src/model/nodes.ts`) | `body`, `timestamp` (ISO string) |

The bridge is `src/model/tldraw-adapter.ts` only. Passing node-model names to `editor.createShapes` throws a validation error at runtime. This broke main twice during M1.

### Anthropic mock injection

Never `vi.mock('@anthropic-ai/sdk')` in tests. Async generators break in Vitest node env. Use `createApp(db, anthropicOverride)` — every test that hits inference must pass a mock client through this parameter.

### DB migrations are additive only

`server/db.ts` migrations use `ALTER TABLE ADD COLUMN` and `CREATE INDEX IF NOT EXISTS`. Never drop columns or tables in a migration. For schema changes requiring table recreation, use the `schema_migrations` idempotency table pattern already in place.

### API keys

`ANTHROPIC_API_KEY` only from `process.env`. Never hardcode. CI will fail if a key pattern appears in committed files.

---

## Project structure

```
src/
  shapes/         — tldraw shape definitions (ChatCard, ArtifactShapes)
  ink/            — InkLayer canvas overlay + pure utils
  model/          — LogNode domain types + tldraw adapter
  components/     — React UI (CommandPalette, LinkOverlay, etc.)
  types/          — shared TypeScript types
  __tests__/      — Vitest unit tests
  tests/          — more Vitest unit tests (legacy location, same runner)

server/
  index.ts        — Express app, createApp factory, auth + rate limiting
  db.ts           — SQLite schema + migrations
  __tests__/      — Vitest integration tests (node env)

e2e/              — Playwright specs (full browser)
  ink.spec.ts
  canvas.spec.ts
  links.spec.ts
  auth.spec.ts

docs/             — this file, TESTING.md, and strategy docs
```

---

## How to run things

```bash
npm run dev          # Vite frontend + Express backend concurrently
npm test             # Vitest (all units + integration)
npx playwright test  # Playwright E2E (starts dev server automatically)
npm run bench        # fps perf gate — must stay P90 ≥ 55fps
npm run build        # production build
```

---

## Test strategy

See `docs/TESTING.md` for full details. Short version:

- **Vitest**: pure logic, state machines, server routes. Fast, no browser.
- **Playwright**: anything touching the canvas, pointer events, auth flows. Required for canvas-touching tickets.
- TDD: write the failing test first.

---

## Key files to read first

When picking up any task, read these before touching code:

1. `CLAUDE.md` — project-specific rules, data model, server conventions, testing rules
2. `src/shapes/ChatCard.tsx` — the most complex shape; understand its state machine before editing
3. `server/db.ts` — all DB schema and migrations live here
4. `server/index.ts` — all route handlers, rate limiting, SSE streaming

---

## Recurring gotchas

**`window.__tldrawEditor` global**: `ChatCard.tsx` stores the editor in a window global for cross-component access. This is intentional, not a bug.

**`link_feedback` has no FK**: The `link_id` column is a plain text correlation field, not a foreign key. Audit rows must survive after the referenced `artifact_links` row is deleted. Do not add a FK constraint.

**`authRateMap` export**: The rate-limit map is exported from `server/index.ts` so tests can call `.clear()` in `afterEach`. If you see tests leaking rate-limit state, check that `authRateMap.clear()` is in the afterEach.

**`src/db/` is dead code**: The `src/db/` directory (artifacts.ts, links.ts, etc.) has no production importers. It is deleted. Do not recreate it.

**tldraw draw tool ID**: The built-in draw tool is `'draw'` (not `'pencil'`, not `'pen'`). The ink layer is a separate custom overlay (`src/ink/InkLayer.tsx`), not the tldraw draw tool.

**SSE in Vitest**: `readSseLines` is an async generator over a `ReadableStream`. Test it with real `TextEncoder`/`ReadableStream` — do not mock the stream internals.

---

## Current tickets (as of 2026-06-12)

Check the Linear board for up-to-date status. Two planned tickets:

- **Playwright E2E baseline suite** — Playwright is installed and all 4 spec files exist. Tickets track ongoing maintenance and expansion.
- **Test strategy documentation** — `docs/TESTING.md` and `docs/AGENT_HANDOFF.md` (this file) cover the strategy. Tickets track keeping them current.

> **Note**: Linear MCP is not installed in this environment. Linear tickets must be created and updated manually at linear.app.

---

## PR checklist

Before opening a PR:

- [ ] `npm test` exits 0
- [ ] `npx playwright test` exits 0 (or spec is marked `test.skip` with a linked ticket)
- [ ] No API keys in any committed file
- [ ] DB migrations are additive only
- [ ] Canvas-touching changes have a Playwright spec
- [ ] Shape props use `summary`/`createdAt`, not `body`/`timestamp`
