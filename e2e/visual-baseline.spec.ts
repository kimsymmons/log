import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

/**
 * Visual regression baselines for the canvas, run against BASE_URL (local dev by
 * default, or the live Vercel deployment via BASE_URL=https://…).
 *
 * Generate / refresh baselines with:
 *   npx playwright test e2e/visual-baseline.spec.ts --update-snapshots
 */

const __dirname = dirname(fileURLToPath(import.meta.url))

function readTestToken(): string {
  try {
    const raw = readFileSync(join(__dirname, '.auth', 'token.json'), 'utf8')
    return (JSON.parse(raw) as { token?: string }).token ?? ''
  } catch {
    return ''
  }
}

const TEST_TOKEN = readTestToken()

// Wait until tldraw has mounted and exposed the editor, then settle.
async function waitForCanvas(page: Page): Promise<void> {
  await expect(page.locator('.tl-canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => Boolean((window as unknown as { __tldrawEditor?: unknown }).__tldrawEditor), {
    timeout: 20_000,
  })
}

// Set zoom to an exact level, centred, so screenshots are deterministic.
async function setZoom(page: Page, zoom: number): Promise<void> {
  await page.evaluate((z) => {
    const editor = (window as unknown as { __tldrawEditor: { resetZoom: () => void; setCamera: (c: { x: number; y: number; z: number }, o?: { immediate?: boolean }) => void } }).__tldrawEditor
    editor.setCamera({ x: 0, y: 0, z: z }, { immediate: true })
  }, zoom)
}

test.describe('visual baselines', () => {
  test.beforeEach(async ({ page }) => {
    // Seed the auth JWT before any app code runs. The canvas renders without it,
    // but this authenticates the app's background API calls when a token exists.
    await page.addInitScript((token) => {
      if (token) localStorage.setItem('auth_token', token)
    }, TEST_TOKEN)

    // Keep specs hermetic: no live backend dependency for the visuals under test.
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
    await page.route('**/links**', (route) => route.fulfill({ json: [] }))
    await page.route('**/auth/me', (route) => route.fulfill({ json: { email: 'test@log.local' } }))

    await page.goto('/')
    await waitForCanvas(page)
    await setZoom(page, 1)
    // Park the pointer off-canvas so the default screenshots have no hover state.
    await page.mouse.move(0, 0)
  })

  test('empty canvas at 100% zoom', async ({ page }) => {
    await expect(page).toHaveScreenshot('canvas-empty.png', { animations: 'disabled' })
  })

  test('canvas with a musing node', async ({ page }) => {
    await page.locator('.tl-canvas').click({ position: { x: 640, y: 360 } })
    await page.keyboard.press('m')
    const card = page.locator('.tl-html-container[data-shape-type="musing"]')
    await expect(card).toHaveCount(1)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('canvas-with-musing.png', { animations: 'disabled' })
  })

  test('canvas zoomed to ~50%', async ({ page }) => {
    await page.locator('.tl-canvas').click({ position: { x: 640, y: 360 } })
    await page.keyboard.press('m')
    await expect(page.locator('.tl-html-container[data-shape-type="musing"]')).toHaveCount(1)
    await setZoom(page, 0.5)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('canvas-zoom-minimal.png', { animations: 'disabled' })
  })

  test('musing node hover state', async ({ page }) => {
    await page.locator('.tl-canvas').click({ position: { x: 640, y: 360 } })
    await page.keyboard.press('m')
    const card = page.locator('.tl-html-container[data-shape-type="musing"]')
    await expect(card).toHaveCount(1)
    await card.hover()
    await expect(page).toHaveScreenshot('canvas-hover-state.png', { animations: 'disabled' })
  })
})
