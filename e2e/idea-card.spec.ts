import { test, expect } from '@playwright/test'

// Idea cards: loaded from /artifacts?type=idea, auto-tagged from title + body,
// rendered as chat-cards with cardType 'idea' (lightbulb glyph), no source link.
test.describe('idea cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/ink/strokes', (r) => r.fulfill({ json: [] }))
    await page.route('**/links**', (r) => r.fulfill({ json: [] }))
    await page.route('**/artifacts**', (route) => {
      if (route.request().url().includes('type=idea')) {
        route.fulfill({
          json: [
            { id: 'i1', type: 'idea', title: 'Spatial bookmarks', sourceUrl: null, created_at: Date.now() - 3600_000,
              content: 'Pin regions of the canvas for quick recall. Jump back to a saved viewport instantly.' },
            { id: 'i2', type: 'idea', title: 'Bookmarks panel', sourceUrl: null, created_at: Date.now() - 7200_000,
              content: 'A side panel listing every bookmark. Bookmarks grouped by project.' },
          ],
        })
      } else {
        route.fulfill({ json: [] })
      }
    })
    await page.goto('/')
    await page.waitForFunction(() => (window as unknown as { __tldrawEditor?: unknown }).__tldrawEditor != null)
  })

  test('loads idea artifacts as auto-tagged Idea cards with no source link', async ({ page }) => {
    await expect(page.getByText('Spatial bookmarks')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Bookmarks panel')).toBeVisible()
    await expect(page.getByText(/Pin regions of the canvas for quick recall\./)).toBeVisible()
    await page.waitForTimeout(500)

    const cards = await page.evaluate(() => {
      const ed = (window as unknown as { __tldrawEditor: { getCurrentPageShapes: () => Array<{ type: string; props: { cardType?: string; tags?: string[]; sourceUrl?: string } }> } }).__tldrawEditor
      return ed.getCurrentPageShapes().filter((s) => s.type === 'chat-card')
        .map((s) => ({ cardType: s.props.cardType, tags: s.props.tags ?? [], sourceUrl: s.props.sourceUrl }))
    })
    expect(cards).toHaveLength(2)
    expect(cards.every((c) => c.cardType === 'idea')).toBe(true)
    expect(cards.every((c) => c.tags.length > 0)).toBe(true)       // auto-tagged
    expect(cards.every((c) => !c.sourceUrl)).toBe(true)            // no source url
    await expect(page.getByText('Open in Claude')).toHaveCount(0)  // no source link
  })
})
