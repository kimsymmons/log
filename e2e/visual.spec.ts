import { test, expect, type Page } from '@playwright/test'

/**
 * PEO-162 — comprehensive visual regression harness.
 *
 * One spec per distinct UI surface the built app renders (see the surface
 * inventory below). This file is BOTH the baseline-capture and the PR
 * regression runner: `toHaveScreenshot()` compares against the committed
 * baseline on a normal run, and rewrites it when invoked with
 * `--update-snapshots`. (Playwright needs no separate "baseline" vs "runner"
 * file — the flag is the mode switch. See PR notes.)
 *
 * Run on PRs (compare, must be diff-free):
 *   BASE_URL=http://localhost:5173 npx playwright test e2e/visual.spec.ts
 * Regenerate after an intentional UI change, then eyeball the new PNGs:
 *   BASE_URL=http://localhost:5173 npx playwright test e2e/visual.spec.ts --update-snapshots
 *
 * Baselines live in e2e/visual.spec.ts-snapshots/ as <name>-chromium-darwin.png
 * (per-platform — regenerate on macOS; a Linux CI run produces different files).
 *
 * ── Surface inventory (what's built, audited from src/) ──────────────────────
 *   chat card        chat-card (bare "New chat")          Figma: card
 *   thread card      chat-card cardType=thread            Figma: card
 *   idea card        chat-card cardType=idea              Figma: card
 *   project card     chat-card cardType=project           Figma: card + status pill
 *   agent card       agent-card                           DESIGN MISSING
 *   musing           musing                               DESIGN MISSING
 *   gem              gem                                  DESIGN MISSING
 *   skill            skill                                DESIGN MISSING
 *   mcp server       mcp-server                           DESIGN MISSING
 *   toolbar          [data-testid=canvas-toolbar]         Figma: toolbar
 *   filter bar       [data-testid=filter-bar]             Figma: filter bar
 *   zoom pill        [data-testid=zoom-pill]              Figma: chrome
 *   command palette  ⌘K portal                            DESIGN MISSING
 *   connection lines [data-testid=connection-lines]       Figma: connection line
 *   provenance line  [data-testid=provenance-overlay]     DESIGN MISSING
 *   empty canvas     dot grid + chrome                    Figma: chrome
 *
 * Figma coverage is inferred from the design-system component list in CLAUDE.md
 * (card, chrome, filter bar, toolbar, status pill, type glyph, connection line);
 * surfaces outside that list are flagged DESIGN MISSING so the gap stays visible.
 */

// ── Editor handle (exposed at window.__tldrawEditor by App.tsx) ──────────────

interface SeedShape {
  id: string
  type: string
  x: number
  y: number
  props: Record<string, unknown>
}

declare global {
  interface Window {
    __tldrawEditor?: {
      createShape: (s: unknown) => void
      batch: (f: () => void) => void
      setCamera: (c: { x: number; y: number; z: number }, o?: { immediate?: boolean }) => void
    }
  }
}

async function waitForCanvas(page: Page): Promise<void> {
  await expect(page.locator('.tl-canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.__tldrawEditor), { timeout: 20_000 })
}

async function setZoom(page: Page, z: number): Promise<void> {
  await page.evaluate((zoom) => {
    window.__tldrawEditor!.setCamera({ x: 0, y: 0, z: zoom }, { immediate: true })
  }, z)
}

// Seed shapes with meta.pinnedAt far in the future so useClusteringLayout treats
// them as pinned and never relocates them — screenshots stay deterministic.
async function seed(page: Page, shapes: SeedShape[]): Promise<void> {
  await page.evaluate((toSeed) => {
    const ed = window.__tldrawEditor!
    ed.batch(() => {
      for (const s of toSeed) {
        ed.createShape({
          id: `shape:${s.id}`,
          type: s.type,
          x: s.x,
          y: s.y,
          meta: { pinnedAt: 9e15 },
          props: s.props,
        })
      }
    })
  }, shapes)
  // Let the shape mount + clustering settle, then park the pointer off-canvas so
  // no hover state bleeds into the capture.
  await page.waitForTimeout(400)
  await page.mouse.move(0, 0)
}

// tldraw renders HTML shapes twice (interactive + a11y layers); .first() targets
// the visible instance.
function shapeEl(page: Page, type: string) {
  return page.locator(`.tl-html-container[data-shape-type="${type}"]`).first()
}

const messages = [
  { role: 'user', content: 'Should we ship backlinks now?' },
  { role: 'assistant', content: 'Backlinks feel risky for the current scope.' },
]

test.describe('visual regression', () => {
  test.beforeEach(async ({ page }) => {
    // Fresh context per test already clears localStorage; this guards against any
    // persistence written mid-run from leaking into the next surface.
    await page.addInitScript(() => localStorage.removeItem('log:canvas:v1'))
    await page.route('**/artifacts**', (route) => route.fulfill({ json: [] }))
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
    await page.route('**/links**', (route) => route.fulfill({ json: [] }))
    await page.goto('/')
    await waitForCanvas(page)
    await setZoom(page, 1)
    await page.mouse.move(0, 0)
  })

  // ── Canvas background ──────────────────────────────────────────────────────

  test('empty canvas (dot grid + chrome)', async ({ page }) => {
    await expect(page).toHaveScreenshot('empty-canvas.png', { animations: 'disabled' })
  })

  // ── Card types ─────────────────────────────────────────────────────────────

  test('chat card (bare new chat)', async ({ page }) => {
    await seed(page, [{
      id: 'v-chat', type: 'chat-card', x: 80, y: 120,
      props: { w: 240, h: 120, title: 'New chat', messages: [], summary: '', createdAt: 1_700_000_000_000 },
    }])
    await expect(shapeEl(page, 'chat-card')).toHaveScreenshot('card-chat.png', { animations: 'disabled' })
  })

  test('thread card', async ({ page }) => {
    await seed(page, [{
      id: 'v-thread', type: 'chat-card', x: 80, y: 120,
      props: {
        w: 264, h: 200, title: 'Backlinks debate', cardType: 'thread',
        summary: 'Should we ship backlinks now? Backlinks feel risky for the current scope.',
        tags: ['backlinks', 'debate'], messages, createdAt: 1_700_000_000_000,
        sourceUrl: 'https://claude.ai/chat/v-thread',
      },
    }])
    await expect(shapeEl(page, 'chat-card')).toHaveScreenshot('card-thread.png', { animations: 'disabled' })
  })

  test('idea card', async ({ page }) => {
    await seed(page, [{
      id: 'v-idea', type: 'chat-card', x: 80, y: 120,
      props: {
        w: 264, h: 200, title: 'Tag-derived connections', cardType: 'idea',
        summary: 'Draw lines between cards that share a tag, not just explicit links.',
        tags: ['canvas', 'links'], messages: [], createdAt: 1_700_000_000_000,
        sourceThreadId: 'art-thread-1',
      },
    }])
    await expect(shapeEl(page, 'chat-card')).toHaveScreenshot('card-idea.png', { animations: 'disabled' })
  })

  test('project card', async ({ page }) => {
    await seed(page, [{
      id: 'v-project', type: 'chat-card', x: 80, y: 120,
      props: {
        w: 264, h: 208, title: 'Spatial canvas', cardType: 'project',
        summary: 'The infinite-canvas workspace milestone.',
        status: 'In Progress', statusColor: '#f2c94c', issueCount: 12, targetDate: '2026-08-01',
        tags: ['canvas'], messages: [], createdAt: 1_700_000_000_000,
      },
    }])
    await expect(shapeEl(page, 'chat-card')).toHaveScreenshot('card-project.png', { animations: 'disabled' })
  })

  // DESIGN MISSING: no Figma frame for this surface
  test('agent card', async ({ page }) => {
    await seed(page, [{
      id: 'v-agent', type: 'agent-card', x: 80, y: 120,
      props: {
        w: 300, h: 220, agentName: 'Dispatch', model: 'claude-opus-4-8',
        status: 'idle', taskDescription: 'Implement the visual regression harness (PEO-162).',
        tags: ['build'], startedAt: 1_700_000_000_000,
      },
    }])
    await expect(shapeEl(page, 'agent-card')).toHaveScreenshot('card-agent.png', { animations: 'disabled' })
  })

  // DESIGN MISSING: no Figma frame for this surface
  test('musing', async ({ page }) => {
    await seed(page, [{
      id: 'v-musing', type: 'musing', x: 80, y: 120,
      props: {
        w: 280, h: 180, text: 'What if the canvas remembered where you left every thought?',
        tags: ['note'], createdAt: 1_700_000_000_000, linkedTo: [],
      },
    }])
    await expect(shapeEl(page, 'musing')).toHaveScreenshot('card-musing.png', { animations: 'disabled' })
  })

  // DESIGN MISSING: no Figma frame for this surface
  test('gem', async ({ page }) => {
    await seed(page, [{
      id: 'v-gem', type: 'gem', x: 80, y: 120,
      props: {
        w: 280, h: 160, name: 'Code reviewer', description: 'Reviews diffs for correctness and reuse.',
        systemPrompt: 'You are a meticulous code reviewer.', tags: ['review'], linkedTo: [],
      },
    }])
    await expect(shapeEl(page, 'gem')).toHaveScreenshot('card-gem.png', { animations: 'disabled' })
  })

  // DESIGN MISSING: no Figma frame for this surface
  test('skill', async ({ page }) => {
    await seed(page, [{
      id: 'v-skill', type: 'skill', x: 80, y: 120,
      props: {
        w: 280, h: 160, name: 'deep-research', description: 'Fan-out web searches and synthesize a cited report.',
        invocationKey: '/deep-research', tags: ['research'],
      },
    }])
    await expect(shapeEl(page, 'skill')).toHaveScreenshot('card-skill.png', { animations: 'disabled' })
  })

  // DESIGN MISSING: no Figma frame for this surface
  test('mcp server', async ({ page }) => {
    await seed(page, [{
      id: 'v-mcp', type: 'mcp-server', x: 80, y: 120,
      props: {
        w: 280, h: 190, name: 'figma', description: 'Design-system sync.',
        endpoint: 'https://mcp.figma.com', status: 'connected',
        tools: ['use_figma', 'get_variables'], tags: ['design'],
      },
    }])
    await expect(shapeEl(page, 'mcp-server')).toHaveScreenshot('card-mcp-server.png', { animations: 'disabled' })
  })

  // ── Chrome ─────────────────────────────────────────────────────────────────

  test('toolbar', async ({ page }) => {
    await expect(page.getByTestId('canvas-toolbar')).toHaveScreenshot('toolbar.png', { animations: 'disabled' })
  })

  test('filter bar', async ({ page }) => {
    await expect(page.getByTestId('filter-bar')).toHaveScreenshot('filter-bar.png', { animations: 'disabled' })
  })

  test('zoom pill', async ({ page }) => {
    await expect(page.getByTestId('zoom-pill')).toHaveScreenshot('zoom-pill.png', { animations: 'disabled' })
  })

  // ── Overlays ───────────────────────────────────────────────────────────────

  // DESIGN MISSING: no Figma frame for this surface
  test('command palette', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByPlaceholder('Search commands…')).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('command-palette.png', { animations: 'disabled' })
  })

  test('connection lines (shared tag)', async ({ page }) => {
    await seed(page, [
      {
        id: 'v-cl-a', type: 'chat-card', x: 80, y: 120,
        props: {
          w: 264, h: 200, title: 'Backlinks debate', cardType: 'thread',
          summary: 'Should we ship backlinks now? Backlinks feel risky for the current scope.',
          tags: ['backlinks', 'debate'], messages, createdAt: 1_700_000_000_000,
          sourceUrl: 'https://claude.ai/chat/v-cl-a',
        },
      },
      {
        id: 'v-cl-b', type: 'chat-card', x: 440, y: 120,
        props: {
          w: 264, h: 200, title: 'Backlinks rollout', cardType: 'thread',
          summary: 'Plan the backlinks rollout carefully. Backlinks need a clean migration path.',
          tags: ['backlinks', 'rollout'], messages, createdAt: 1_700_000_000_000,
          sourceUrl: 'https://claude.ai/chat/v-cl-b',
        },
      },
    ])
    await expect(page.getByTestId('connection-lines')).toBeVisible()
    await expect(page).toHaveScreenshot('connection-lines.png', { animations: 'disabled' })
  })

  // DESIGN MISSING: no Figma frame for this surface
  test('provenance overlay (chat spawned from a node)', async ({ page }) => {
    await seed(page, [
      {
        id: 'v-pv-src', type: 'gem', x: 80, y: 120,
        props: {
          w: 280, h: 160, name: 'Code reviewer', description: 'Reviews diffs for correctness.',
          systemPrompt: 'You are a meticulous code reviewer.', tags: ['review'], linkedTo: [],
        },
      },
      {
        id: 'v-pv-chat', type: 'chat-card', x: 480, y: 320,
        props: {
          w: 240, h: 120, title: 'Chat about this', messages: [], summary: '',
          createdAt: 1_700_000_000_000, linkedShapeId: 'shape:v-pv-src',
        },
      },
    ])
    await expect(page.getByTestId('provenance-overlay')).toBeVisible()
    await expect(page).toHaveScreenshot('provenance-overlay.png', { animations: 'disabled' })
  })
})
