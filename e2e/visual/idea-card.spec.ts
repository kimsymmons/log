import { test, expect, type Page } from '@playwright/test'

/**
 * Component-level visual regression for the Idea card (lightbulb glyph, yellow
 * --yellow, title + 2-line body + tag chips, no source link). Deterministic via
 * a pinned shape at a fixed position.
 *
 * Refresh after an intentional UI change:
 *   BASE_URL=http://localhost:5173 npx playwright test e2e/visual --update-snapshots
 */

async function waitForCanvas(page: Page): Promise<void> {
  await expect(page.locator('.tl-canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => Boolean((window as unknown as { __tldrawEditor?: unknown }).__tldrawEditor), { timeout: 20_000 })
  await page.waitForFunction(() => Boolean((window as unknown as { lucide?: { icons?: unknown } }).lucide?.icons), { timeout: 20_000 })
  await page.evaluate(() => (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready)
  await page.waitForTimeout(250)
}

test.describe('idea card visuals', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/artifacts**', (route) => route.fulfill({ json: [] }))
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
    await page.route('**/links**', (route) => route.fulfill({ json: [] }))
    await page.goto('/')
    await waitForCanvas(page)
    await page.evaluate(() => {
      const ed = (window as unknown as { __tldrawEditor: { setCamera: (c: { x: number; y: number; z: number }, o?: { immediate?: boolean }) => void } }).__tldrawEditor
      ed.setCamera({ x: 0, y: 0, z: 1 }, { immediate: true })
    })
    await page.mouse.move(0, 0)
  })

  test('idea card at rest', async ({ page }) => {
    await page.evaluate(() => {
      const ed = (window as unknown as { __tldrawEditor: { createShape: (s: unknown) => void } }).__tldrawEditor
      ed.createShape({
        id: 'shape:idea-vi', type: 'chat-card', x: 80, y: 120, meta: { pinnedAt: 9e15 },
        props: {
          w: 264, h: 200, title: 'Spatial bookmarks', cardType: 'idea',
          summary: 'Pin regions of the canvas for quick recall. Jump back to a saved viewport.',
          messages: [], createdAt: Date.now(), tags: ['spatial', 'bookmarks'],
        },
      })
    })
    const card = page.locator('.tl-html-container[data-shape-type="chat-card"]').first()
    await expect(card).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(card).toHaveScreenshot('idea-card-rest.png', { animations: 'disabled' })
  })
})
