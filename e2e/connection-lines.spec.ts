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

test('the line tracks the camera on pan and zoom (no drift)', async ({ page }) => {
  await seedTaggedPair(page)
  const line = page.locator('[data-testid="connection-lines"] line')
  await expect(line).toHaveCount(1)

  const read = async () => {
    const [x1, x2] = await Promise.all([
      line.getAttribute('x1'),
      line.getAttribute('x2'),
    ])
    return { x1: Number(x1), x2: Number(x2), len: Math.abs(Number(x2) - Number(x1)) }
  }

  const before = await read()

  // Pan the camera right: both endpoints must shift left by the same screen delta.
  await page.evaluate(() => {
    const editor = (window as unknown as { __tldrawEditor: any }).__tldrawEditor
    const cam = editor.getCamera()
    editor.setCamera({ x: cam.x - 200, y: cam.y, z: cam.z }, { immediate: true })
  })
  const panned = await read()
  expect(Math.round(panned.x1 - before.x1)).toBe(Math.round(panned.x2 - before.x2))
  expect(panned.x1).not.toBe(before.x1)

  // Zoom in: the on-screen distance between the two endpoints must grow.
  await page.evaluate(() => {
    const editor = (window as unknown as { __tldrawEditor: any }).__tldrawEditor
    const cam = editor.getCamera()
    editor.setCamera({ x: cam.x, y: cam.y, z: cam.z * 2 }, { immediate: true })
  })
  const zoomed = await read()
  expect(zoomed.len).toBeGreaterThan(panned.len * 1.5)
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
