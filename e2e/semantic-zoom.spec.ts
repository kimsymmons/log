import { test, expect } from 'playwright/test'

// PEO-143 — semantic zoom. Canvas nodes collapse detail as the camera zooms out:
//   zoom < 0.6 → minimal, 0.6–0.85 → compact, ≥ 0.85 → full.
//
// tldraw renders HTML shapes twice (interactive + accessibility layers), so we
// target the first [data-detail] instance.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('log:canvas:v1')
  })
  await page.goto('/')
  await page.waitForSelector('.tl-canvas', { timeout: 15_000 })
  await page.keyboard.press('Escape')
})

/** Set the camera zoom to `z`, keeping the (only) shape centred in view. */
async function setZoom(page: import('playwright/test').Page, z: number) {
  await page.evaluate((zoom) => {
    const editor = (window as unknown as { __tldrawEditor: any }).__tldrawEditor
    const id = editor.getCurrentPageShapeIds().values().next().value
    const bounds = editor.getShapePageBounds(id)
    editor.setCamera({ x: 0, y: 0, z: zoom }, { immediate: true })
    editor.centerOnPoint({ x: bounds.midX, y: bounds.midY }, { immediate: true })
  }, z)
}

test('zooming to 50% collapses a node to its minimal state', async ({ page }) => {
  await page.keyboard.press('s')
  const node = page.locator('[data-shape-type="skill"] [data-detail]').first()
  await expect(node).toBeVisible()

  await setZoom(page, 0.5)

  await expect(node).toHaveAttribute('data-detail', 'minimal')
  // Body text is hidden via display:none (still present in the DOM).
  await expect(node.locator('[data-detail-body]')).toBeHidden()
})

test('zooming to 100% shows a node in its full state', async ({ page }) => {
  await page.keyboard.press('s')
  const node = page.locator('[data-shape-type="skill"] [data-detail]').first()
  await expect(node).toBeVisible()

  // Start collapsed, then zoom back in.
  await setZoom(page, 0.5)
  await expect(node).toHaveAttribute('data-detail', 'minimal')

  await setZoom(page, 1)

  await expect(node).toHaveAttribute('data-detail', 'full')
  await expect(node.locator('[data-detail-body]')).toBeVisible()
})

test('mid zoom (70%) hides body but stays compact, not minimal', async ({ page }) => {
  await page.keyboard.press('s')
  const node = page.locator('[data-shape-type="skill"] [data-detail]').first()
  await expect(node).toBeVisible()

  await setZoom(page, 0.7)

  await expect(node).toHaveAttribute('data-detail', 'compact')
  await expect(node.locator('[data-detail-body]')).toBeHidden()
})
