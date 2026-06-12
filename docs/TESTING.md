# Testing Guide

## Overview

Two test layers. Pick the right one:

| Layer | Runner | What it covers | When to use |
|-------|--------|----------------|-------------|
| Unit / integration | Vitest (`npm test`) | Pure functions, state machines, server routes, React logic | Business logic, DB queries, SSE parsing, rate limiting — anything without a real browser |
| E2E | Playwright (`npx playwright test`) | Full user flows in a real browser | Canvas rendering, pointer events, tldraw internals, ink layer, auth flows |

Rule: if a ticket touches the canvas, pointer events, or tldraw, it needs a Playwright spec. Vitest + jsdom cannot replicate tldraw's layout engine.

---

## Vitest

### Running

```bash
npm test              # all tests, watch mode off (CI-safe)
npm test -- --watch   # watch mode
npm test -- src/tests/chat-card-states.test.ts   # single file
```

### Environments

- `src/**` — jsdom (React, DOM APIs)
- `server/**` — node (better-sqlite3, file system)

Configured in `vite.config.ts` via `test.environment` and `test.environmentMatchGlobs`.

### Server test pattern

Always use `createApp(db, anthropicOverride)` injection. Never `vi.mock('@anthropic-ai/sdk')` — async generators break in Vitest node env.

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { createApp } from '../index'
import Database from 'better-sqlite3'
import { runMigrations } from '../db'

let db: ReturnType<typeof Database>
let app: ReturnType<typeof createApp>

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  const mockAnthropic = { messages: { create: vi.fn().mockResolvedValue({ content: [] }) } } as unknown as Anthropic
  app = createApp(db, mockAnthropic)
})
```

### What belongs in Vitest

- Pure utility functions (`parseSseData`, `readSseLines`, `chatCardTransition`, `pointNearStroke`, `applyCamera`, `computeCost`)
- Server route handlers (happy path + edge cases + error paths)
- Rate limiting logic
- DB migration idempotence
- React state machines (state transition tables, not rendering)
- SSE stream parsing

### What does NOT belong in Vitest

- Canvas rendering correctness
- Pointer/touch/stylus event handling
- tldraw shape creation via `editor.createShapes`
- Ink stroke rasterisation
- Drag-and-drop
- Auth cookie flow

---

## Playwright

### Running

```bash
npx playwright test                    # headless, all specs
npx playwright test --headed           # with browser visible
npx playwright test e2e/ink.spec.ts    # single spec
npx playwright test --ui               # interactive UI mode
```

### Configuration

`playwright.config.ts` at repo root. Single project: Chromium. `webServer` starts `npm run dev` automatically — no manual server needed.

### Mocking conventions

All specs mock the backend with `page.route()`. Specs must not require a live API server or database.

```typescript
// Silence calls not under test
await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
await page.route('**/links**', (route) => route.fulfill({ json: [] }))

// Assert a specific call was made
let posted = false
await page.route('**/ink/strokes', async (route) => {
  if (route.request().method() === 'POST') posted = true
  await route.fulfill({ status: 201, json: { ok: true } })
})
```

### Spec inventory

| File | What it tests |
|------|--------------|
| `e2e/ink.spec.ts` | Ink layer: cursor toggle, stroke posting, load-from-GET |
| `e2e/canvas.spec.ts` | ChatCard creation via palette, drag, keyboard shortcuts |
| `e2e/links.spec.ts` | SVG link overlay visibility, line length, trust popover |
| `e2e/auth.spec.ts` | Unauthenticated gate, magic-link request, verify flow |

### Adding a new spec

1. Create `e2e/<feature>.spec.ts`
2. Mock all API calls with `page.route()` in `beforeEach`
3. Use semantic locators (`getByRole`, `getByText`) over CSS selectors
4. Keep each test focused on one user-visible behaviour
5. Avoid `waitForTimeout` except after fire-and-forget async ops (e.g., after `mouse.up()` waiting for a POST)

---

## TDD workflow

For new features:

1. Write Vitest tests for the pure-logic layer first (state machine, parser, handler)
2. Write a Playwright spec for the user-visible behaviour
3. Implement until both pass

For bug fixes:

1. Write a failing test that reproduces the bug (Vitest if logic, Playwright if UI)
2. Fix the bug
3. Confirm the test passes

---

## CI

`npm test` (Vitest) and `npx playwright test` both run on every push. Playwright has `retries: 2` in CI and uploads `playwright-report/` + `test-results/` as artifacts on failure.

The perf gate (`npm run bench`, P90 ≥ 55fps) runs separately in the `bench` job.
