import { test, expect } from 'playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.tl-canvas', { timeout: 15_000 })
  await page.keyboard.press('Escape')
})

test('S key creates a Skill node at viewport centre', async ({ page }) => {
  await page.keyboard.press('s')
  const node = page.locator('.tl-html-container[data-shape-type="skill"]')
  await expect(node).toHaveCount(1)
})

test('C key creates an MCP Server node at viewport centre', async ({ page }) => {
  await page.keyboard.press('c')
  const node = page.locator('.tl-html-container[data-shape-type="mcp-server"]')
  await expect(node).toHaveCount(1)
})

test('G key creates a Gem node at viewport centre', async ({ page }) => {
  await page.keyboard.press('g')
  const node = page.locator('.tl-html-container[data-shape-type="gem"]')
  await expect(node).toHaveCount(1)
})

test('S creates Skill, C creates MCP Server, G creates Gem independently', async ({ page }) => {
  await page.keyboard.press('s')
  await page.keyboard.press('Escape')
  await page.keyboard.press('c')
  await page.keyboard.press('Escape')
  await page.keyboard.press('g')

  await expect(page.locator('.tl-html-container[data-shape-type="skill"]')).toHaveCount(1)
  await expect(page.locator('.tl-html-container[data-shape-type="mcp-server"]')).toHaveCount(1)
  await expect(page.locator('.tl-html-container[data-shape-type="gem"]')).toHaveCount(1)
})
