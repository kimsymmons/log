import { test, expect } from 'playwright/test'

test('no page switcher control is visible', async ({ page }) => {
  await page.goto('/')
  // Wait for tldraw UI chrome to be fully rendered
  await page.waitForSelector('.tlui-menu-zone', { timeout: 15_000 })

  // DefaultPageMenu renders a button with data-testid="page-menu.button".
  // Asserting count=0 would be vacuously true if the menu never renders, so
  // first confirm the menu zone IS present (above), then check the button is absent.
  const pageMenuButton = page.locator('[data-testid="page-menu.button"]')
  await expect(pageMenuButton).toHaveCount(0)
})
