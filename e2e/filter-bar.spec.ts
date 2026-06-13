import { test, expect } from 'playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.tl-canvas', { timeout: 15_000 })
  // Start from a clean canvas — clear any persisted shapes, then reload.
  await page.evaluate(() => localStorage.removeItem('log:canvas:v1'))
  await page.reload()
  await page.waitForSelector('.tl-canvas', { timeout: 15_000 })
  await page.keyboard.press('Escape')
})

const opacityOf = (page: import('playwright/test').Page, selector: string) =>
  page.locator(selector).evaluate(el => getComputedStyle(el).opacity)

test('filter bar renders with All and node-type pills', async ({ page }) => {
  const bar = page.getByRole('toolbar', { name: 'Filter node types' })
  await expect(bar).toBeVisible()
  await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Idea/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Thread/ })).toBeVisible()
  // Agent/Skill/MCP/Gem are not filter pills (the five canonical card types only).
  await expect(page.getByRole('button', { name: /Skill/ })).toHaveCount(0)
})

test('activating a filter dims non-matching shapes; All restores them', async ({ page }) => {
  // Create two shapes of different types.
  await page.keyboard.press('m') // musing → Idea
  await page.keyboard.press('Escape')
  await page.keyboard.press('s') // skill → Skill
  await page.keyboard.press('Escape')

  // Scope to the shape's HTMLContainer — tldraw also tags its own .tl-shape
  // wrapper with data-shape-type, and the dimming lands on the container.
  const musingSel = '.tl-html-container[data-shape-type="musing"]'
  const skillSel = '.tl-html-container[data-shape-type="skill"]'
  const musing = page.locator(musingSel)
  const skill = page.locator(skillSel)
  await expect(musing).toHaveCount(1)
  await expect(skill).toHaveCount(1)

  // Both fully visible under "All".
  expect(await opacityOf(page, musingSel)).toBe('1')
  expect(await opacityOf(page, skillSel)).toBe('1')

  // Activate the Idea filter — skill should dim, musing stays visible.
  await page.getByRole('button', { name: /Idea/ }).click()
  await expect(skill).toHaveAttribute('data-filter-dimmed', 'true')
  expect(await opacityOf(page, skillSel)).toBe('0.15')
  expect(await opacityOf(page, musingSel)).toBe('1')

  // Clicking All restores both.
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(skill).not.toHaveAttribute('data-filter-dimmed', 'true')
  expect(await opacityOf(page, skillSel)).toBe('1')
  expect(await opacityOf(page, musingSel)).toBe('1')
})
