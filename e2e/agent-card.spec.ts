import { test, expect } from 'playwright/test'

// tldraw renders HTML shapes twice in the DOM (interactive + accessibility layers).
// Use .first() to target the visible instance.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('log:canvas:v1')
  })
  await page.goto('/')
  await page.waitForSelector('.tl-canvas', { timeout: 15_000 })
  await page.keyboard.press('Escape')
})

test('A key creates an agent card at viewport centre', async ({ page }) => {
  await page.keyboard.press('a')
  await expect(page.locator('[data-shape-type="agent-card"]').first()).toBeVisible()
})

test('card shows model name', async ({ page }) => {
  await page.keyboard.press('a')
  const card = page.locator('[data-shape-type="agent-card"]').first()
  await expect(card).toBeVisible()
  await expect(card.getByText('claude-sonnet-4-6')).toBeVisible()
})

test('running status has animated disc', async ({ page }) => {
  await page.keyboard.press('a')
  const card = page.locator('[data-shape-type="agent-card"]').first()
  await expect(card).toBeVisible()
  // status indicator has data-status="running"
  await expect(card.locator('[data-status="running"]')).toBeVisible()
  // AgentNode disc is present and has its pulse animation class
  const disc = card.locator('.log-agent-disc')
  await expect(disc).toBeVisible()
  const style = await disc.getAttribute('style')
  expect(style).toContain('log-disc-pulse')
})
