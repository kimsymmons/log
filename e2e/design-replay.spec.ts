import { test, expect } from '@playwright/test'

// Covers the design-replay deliverables that touch canvas rendering:
// the type filter bar (P0) and the selection-driven properties panel (P4),
// plus tag chips on a card (P1).
test.describe('functionality replay — design alignment', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
    await page.route('**/links**', (route) => route.fulfill({ json: [] }))
    await page.goto('/')
    await expect(page.locator('.tl-canvas')).toBeVisible()
  })

  test('filter bar shows the five card types and none of the removed ones', async ({ page }) => {
    const bar = page.getByRole('toolbar').filter({ hasText: 'All' })
    for (const label of ['All', 'Project', 'Idea', 'Thread', 'Doc', 'Sketch']) {
      await expect(bar.getByText(label, { exact: true })).toBeVisible()
    }
    for (const removed of ['Agent', 'Skill', 'MCP', 'Gem']) {
      await expect(bar.getByText(removed, { exact: true })).toHaveCount(0)
    }
  })

  test('a card renders its tag chip and selecting it opens the properties panel', async ({ page }) => {
    await page.evaluate(() => {
      const ed = (window as unknown as { __tldrawEditor: { createShape: (s: unknown) => void } }).__tldrawEditor
      ed.createShape({
        type: 'chat-card',
        x: 120,
        y: 160,
        props: {
          w: 240,
          h: 120,
          title: 'Replay Card',
          messages: [],
          summary: 'a replayed card',
          createdAt: Date.now(),
          cardType: 'project',
          tags: ['design'],
        },
      })
    })

    await expect(page.getByText('Replay Card')).toBeVisible()
    // Tag chip is rendered on the (neutral) card.
    await expect(page.getByText('design').first()).toBeVisible()

    // Select the card programmatically (clicking would also expand it).
    await page.evaluate(() => {
      const ed = (window as unknown as {
        __tldrawEditor: { getCurrentPageShapes: () => Array<{ id: string; type: string }>; select: (id: string) => void }
      }).__tldrawEditor
      const card = ed.getCurrentPageShapes().find((s) => s.type === 'chat-card')
      if (card) ed.select(card.id)
    })

    const panel = page.getByText('Properties').locator('..')
    await expect(panel.getByText('Properties')).toBeVisible()
    await expect(panel.getByText('Type', { exact: true })).toBeVisible()
  })
})
