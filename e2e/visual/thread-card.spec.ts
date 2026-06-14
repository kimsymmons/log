import { test, expect, type Page } from '@playwright/test'

/**
 * Component-level visual regression for the thread card + chrome. Deterministic
 * by construction: cards are created with fixed positions and `meta.pinnedAt`
 * so the clustering layout leaves them in place.
 *
 * Refresh after an intentional UI change:
 *   BASE_URL=http://localhost:5173 npx playwright test e2e/visual --update-snapshots
 */

async function waitForCanvas(page: Page): Promise<void> {
  await expect(page.locator('.tl-canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => Boolean((window as unknown as { __tldrawEditor?: unknown }).__tldrawEditor), { timeout: 20_000 })
}

async function setZoom(page: Page, z: number): Promise<void> {
  await page.evaluate((zoom) => {
    const ed = (window as unknown as { __tldrawEditor: { setCamera: (c: { x: number; y: number; z: number }, o?: { immediate?: boolean }) => void } }).__tldrawEditor
    ed.setCamera({ x: 0, y: 0, z: zoom }, { immediate: true })
  }, z)
}

async function seedCard(page: Page, x: number, id: string, title: string, summary: string, tags: string[]): Promise<void> {
  await page.evaluate(({ x, id, title, summary, tags }) => {
    const ed = (window as unknown as { __tldrawEditor: { createShape: (s: unknown) => void } }).__tldrawEditor
    ed.createShape({
      id: `shape:${id}`, type: 'chat-card', x, y: 120, meta: { pinnedAt: 9e15 },
      props: {
        w: 264, h: 200, title, summary, cardType: 'thread', tags,
        messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
        createdAt: Date.now(), sourceUrl: `https://claude.ai/chat/${id}`,
      },
    })
  }, { x, id, title, summary, tags })
}

test.describe('thread card visuals', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/artifacts**', (route) => route.fulfill({ json: [] }))
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
    await page.route('**/links**', (route) => route.fulfill({ json: [] }))
    await page.goto('/')
    await waitForCanvas(page)
    await setZoom(page, 1)
    await page.mouse.move(0, 0)
  })

  test('thread card at rest', async ({ page }) => {
    await seedCard(page, 80, 'vc-a', 'Backlinks debate', 'Should we ship backlinks now? Backlinks feel risky for the current scope.', ['backlinks', 'debate'])
    const card = page.locator('.tl-html-container[data-shape-type="chat-card"]').first()
    await expect(card).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(card).toHaveScreenshot('thread-card-rest.png', { animations: 'disabled' })
  })

  test('connection line between two cards sharing a tag', async ({ page }) => {
    await seedCard(page, 80, 'vc-a', 'Backlinks debate', 'Should we ship backlinks now? Backlinks feel risky for the current scope.', ['backlinks', 'debate'])
    await seedCard(page, 440, 'vc-b', 'Backlinks rollout', 'Plan the backlinks rollout carefully. Backlinks need a clean migration path.', ['backlinks', 'rollout'])
    await page.waitForTimeout(400)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('thread-connection.png', { animations: 'disabled' })
  })

  test('filter bar', async ({ page }) => {
    await expect(page.getByTestId('filter-bar')).toHaveScreenshot('filter-bar.png', { animations: 'disabled' })
  })

  test('toolbar', async ({ page }) => {
    await expect(page.getByTestId('canvas-toolbar')).toHaveScreenshot('toolbar.png', { animations: 'disabled' })
  })

  test('zoom pill', async ({ page }) => {
    await expect(page.getByTestId('zoom-pill')).toHaveScreenshot('zoom-pill.png', { animations: 'disabled' })
  })
})
