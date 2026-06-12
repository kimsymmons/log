import { test, expect } from '@playwright/test'

// Stable shape IDs used across mocks
const CARD_A_ID = 'shape:card-a'
const CARD_B_ID = 'shape:card-b'

const MOCK_LINK = {
  id: 'link-e2e-1',
  source_id: CARD_A_ID,
  target_id: CARD_B_ID,
  strength: 0.9,
  provenance: 'model-drawn',
  rationale: 'Both discuss the same project',
  link_type: 'same-project',
  created_at: Date.now(),
}

test.describe('link overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))

    // Return the mock link for any artifactId query
    await page.route('**/links**', async (route) => {
      const url = route.request().url()
      if (url.includes('artifactId')) {
        await route.fulfill({ json: [MOCK_LINK] })
      } else {
        await route.fulfill({ json: { ok: true } })
      }
    })
  })

  test('SVG link line appears between two cards when /links returns a link', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.tl-canvas')).toBeVisible()

    // Create two cards via command palette
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    await expect(page.getByText('New chat').first()).toBeVisible()

    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')

    // The LinkOverlay polls on mount (and every 30s). Wait for the SVG line.
    // The line is rendered in an SVG overlay with pointer-events:none.
    const linkLine = page.locator('svg line').first()
    await expect(linkLine).toBeVisible({ timeout: 5000 })
  })

  test('link line has non-zero length', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.tl-canvas')).toBeVisible()

    // Create two cards
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')

    const line = page.locator('svg line').first()
    await expect(line).toBeVisible({ timeout: 5000 })

    const x1 = parseFloat(await line.getAttribute('x1') ?? '0')
    const y1 = parseFloat(await line.getAttribute('y1') ?? '0')
    const x2 = parseFloat(await line.getAttribute('x2') ?? '0')
    const y2 = parseFloat(await line.getAttribute('y2') ?? '0')

    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    expect(length).toBeGreaterThan(0)
  })

  test('clicking a link line opens the trust popover', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.tl-canvas')).toBeVisible()

    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')

    const line = page.locator('svg line').first()
    await expect(line).toBeVisible({ timeout: 5000 })

    // Click the midpoint of the line
    const x1 = parseFloat(await line.getAttribute('x1') ?? '0')
    const y1 = parseFloat(await line.getAttribute('y1') ?? '0')
    const x2 = parseFloat(await line.getAttribute('x2') ?? '0')
    const y2 = parseFloat(await line.getAttribute('y2') ?? '0')

    await page.mouse.click((x1 + x2) / 2, (y1 + y2) / 2)

    // Popover should show Keep / Dismiss / Remove
    await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible({ timeout: 2000 })
    await expect(page.getByRole('button', { name: 'Dismiss' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()
  })
})
