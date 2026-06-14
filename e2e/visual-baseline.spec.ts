import { test, expect, type Page } from '@playwright/test'

/**
 * Visual regression baselines for the canvas chrome, run against BASE_URL
 * (local dev by default). These assert the app stays visually consistent with
 * itself — the references were captured after the chrome redesign was confirmed
 * correct, NOT generated from the design HTML.
 *
 * Refresh after an intentional UI change:
 *   BASE_URL=http://localhost:5173 npx playwright test e2e/visual-baseline.spec.ts --update-snapshots
 */

async function waitForCanvas(page: Page): Promise<void> {
  await expect(page.locator('.tl-canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => Boolean((window as unknown as { __tldrawEditor?: unknown }).__tldrawEditor), { timeout: 20_000 })
  // Lucide icons load async from a CDN — wait so glyphs are painted in shots.
  await page.waitForFunction(() => Boolean((window as unknown as { lucide?: { icons?: unknown } }).lucide?.icons), { timeout: 20_000 })
  await page.evaluate(() => (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready)
  await page.waitForTimeout(250)
}

async function setZoom(page: Page, z: number): Promise<void> {
  await page.evaluate((zoom) => {
    const ed = (window as unknown as { __tldrawEditor: { setCamera: (c: { x: number; y: number; z: number }, o?: { immediate?: boolean }) => void } }).__tldrawEditor
    ed.setCamera({ x: 0, y: 0, z: zoom }, { immediate: true })
  }, z)
}

// Seed two pinned thread cards at fixed positions so screenshots are
// deterministic (meta.pinnedAt keeps the clustering layout from moving them).
async function seedThreads(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ed = (window as unknown as {
      __tldrawEditor: { batch: (f: () => void) => void; createShape: (s: unknown) => void }
    }).__tldrawEditor
    const now = Date.now()
    const mk = (id: string, x: number, title: string, summary: string, tags: string[]) =>
      ed.createShape({
        id: `shape:${id}`, type: 'chat-card', x, y: 120, meta: { pinnedAt: 9e15 },
        props: {
          w: 264, h: 200, title, summary, cardType: 'thread', tags,
          messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
          createdAt: now, sourceUrl: `https://claude.ai/chat/${id}`,
        },
      })
    ed.batch(() => {
      mk('vt-a', 80, 'Backlinks debate', 'Should we ship backlinks now? Backlinks feel risky for the current scope.', ['backlinks', 'debate'])
      mk('vt-b', 440, 'Backlinks rollout', 'Plan the backlinks rollout carefully. Backlinks need a clean migration path.', ['backlinks', 'rollout'])
    })
  })
}

test.describe('visual baselines', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/artifacts**', (route) => route.fulfill({ json: [] }))
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
    await page.route('**/links**', (route) => route.fulfill({ json: [] }))
    await page.goto('/')
    await waitForCanvas(page)
    await setZoom(page, 1)
    await page.mouse.move(0, 0)
  })

  test('empty canvas', async ({ page }) => {
    await expect(page).toHaveScreenshot('canvas-empty.png', { animations: 'disabled' })
  })

  test('canvas with thread cards', async ({ page }) => {
    await seedThreads(page)
    await page.waitForTimeout(500)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('canvas-threads.png', { animations: 'disabled' })
  })

  test('filter bar', async ({ page }) => {
    await expect(page.getByTestId('filter-bar')).toHaveScreenshot('filter-bar.png', { animations: 'disabled' })
  })

  test('zoom pill', async ({ page }) => {
    await expect(page.getByTestId('zoom-pill')).toHaveScreenshot('zoom-pill.png', { animations: 'disabled' })
  })
})
