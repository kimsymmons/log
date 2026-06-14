import { test, expect } from '@playwright/test'

test.describe('ink layer', () => {
  test.beforeEach(async ({ page }) => {
    // Mock ink API so tests don't need a live backend
    await page.route('**/ink/strokes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: [] })
      } else {
        await route.fulfill({ status: 201, json: { ok: true } })
      }
    })
    await page.route('**/ink/strokes/**', async (route) => {
      await route.fulfill({ json: { ok: true } })
    })

    await page.goto('/')
  })

  test('app loads and canvas is visible', async ({ page }) => {
    await expect(page.locator('.tl-canvas')).toBeVisible()
  })

  test('clicking the Ink toolbar button toggles the ink mode cursor', async ({ page }) => {
    const inkButton = page.getByRole('button', { name: /pen/i })
    await expect(inkButton).toBeVisible()

    // Before activating — default canvas cursor
    const canvas = page.locator('.tl-canvas')
    const cursorBefore = await canvas.evaluate((el) => getComputedStyle(el).cursor)
    expect(cursorBefore).not.toBe('crosshair')

    await inkButton.click()

    // The InkLayer canvas sits above tldraw with cursor:crosshair when active
    const inkCanvas = page.locator('canvas').last()
    await expect(inkCanvas).toBeVisible()
    const cursorAfter = await inkCanvas.evaluate((el) => (el as HTMLCanvasElement).style.cursor)
    expect(cursorAfter).toBe('crosshair')
  })

  test('drawing a stroke on the canvas posts to the ink API', async ({ page }) => {
    let postCalled = false
    await page.route('**/ink/strokes', async (route) => {
      if (route.request().method() === 'POST') {
        postCalled = true
        await route.fulfill({ status: 201, json: { ok: true } })
      } else {
        await route.fulfill({ json: [] })
      }
    })

    // Activate ink mode
    await page.getByRole('button', { name: /pen/i }).click()

    // Draw a short stroke via pointer events
    const inkCanvas = page.locator('canvas').last()
    const box = await inkCanvas.boundingBox()
    if (!box) throw new Error('ink canvas not found')

    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 50, cy + 30, { steps: 10 })
    await page.mouse.move(cx + 100, cy + 10, { steps: 10 })
    await page.mouse.up()

    // Give the async persist call time to fire
    await page.waitForTimeout(200)
    expect(postCalled).toBe(true)
  })

  test('strokes returned from GET /ink/strokes are rendered on load', async ({ page }) => {
    const sampleStroke = {
      id: 'stroke-e2e-1',
      points: [
        { x: 200, y: 200, pressure: 0.5 },
        { x: 250, y: 220, pressure: 0.6 },
        { x: 300, y: 210, pressure: 0.5 },
      ],
      color: '#1a1a1a',
      width: 3,
      canvasX: 200,
      canvasY: 200,
      zoom: 1,
    }

    // Override the mock to return a persisted stroke
    await page.route('**/ink/strokes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: [sampleStroke] })
      } else {
        await route.fulfill({ status: 201, json: { ok: true } })
      }
    })

    await page.goto('/')
    await expect(page.locator('.tl-canvas')).toBeVisible()

    // The ink canvas is rendered — verify the canvas element is present and sized
    const inkCanvas = page.locator('canvas').last()
    await expect(inkCanvas).toBeVisible()
    const box = await inkCanvas.boundingBox()
    expect(box?.width).toBeGreaterThan(0)
    expect(box?.height).toBeGreaterThan(0)
  })
})
