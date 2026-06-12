import { test, expect } from 'playwright/test'

// PEO-152 — connection lines. Nodes that share a tag are joined by an SVG line
// (with a dot anchor at its midpoint) drawn in `InFrontOfTheCanvas`. The line is
// subtle indigo by default and lights up in the tag's colour when either
// endpoint is hovered or selected.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('log:canvas:v1')
  })
  await page.goto('/')
  await page.waitForSelector('.tlui-menu-zone', { timeout: 15_000 })
  await page.keyboard.press('Escape')
})

/** Create two skill nodes that share a tag, spaced apart on the page. */
async function seedTaggedPair(page: import('playwright/test').Page) {
  await page.evaluate(() => {
    const editor = (window as unknown as { __tldrawEditor: any }).__tldrawEditor
    const base = {
      type: 'skill',
      props: { w: 240, h: 140, name: 'n', description: '', invocationKey: '', tags: ['design'] },
    }
    editor.createShape({ ...base, x: -300, y: 0 })
    editor.createShape({ ...base, x: 300, y: 0 })
    editor.selectNone()
    editor.setHoveredShape(null)
    editor.zoomToFit({ immediate: true })
  })
}

test('a line is drawn between two nodes that share a tag', async ({ page }) => {
  await seedTaggedPair(page)
  const svg = page.locator('[data-testid="connection-lines"]')
  await expect(svg).toBeVisible()
  await expect(svg.locator('line')).toHaveCount(1)
  // dot anchor at the midpoint
  await expect(svg.locator('circle')).toHaveCount(1)
})

test('the connection is dim by default and highlights on hover', async ({ page }) => {
  await seedTaggedPair(page)
  const group = page.locator('[data-testid="connection-lines"] g')
  await expect(group).toHaveAttribute('data-highlighted', 'false')

  // Hover the first node — the line connecting it should highlight.
  await page.locator('[data-shape-type="skill"]').first().hover()
  await expect(group).toHaveAttribute('data-highlighted', 'true')
})

test('no line is drawn when nodes do not share a tag', async ({ page }) => {
  await page.evaluate(() => {
    const editor = (window as unknown as { __tldrawEditor: any }).__tldrawEditor
    const mk = (x: number, tag: string) => ({
      type: 'skill',
      x,
      y: 0,
      props: { w: 240, h: 140, name: 'n', description: '', invocationKey: '', tags: [tag] },
    })
    editor.createShape(mk(-300, 'red'))
    editor.createShape(mk(300, 'blue'))
    editor.selectNone()
    editor.zoomToFit({ immediate: true })
  })
  await expect(page.locator('[data-testid="connection-lines"]')).toHaveCount(0)
})
