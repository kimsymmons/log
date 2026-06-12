import { test, expect } from 'playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.tlui-menu-zone', { timeout: 15_000 })
  // Clear any existing shapes so M shortcut doesn't conflict
  await page.keyboard.press('Escape')
})

test('M key creates a Musing card at viewport centre', async ({ page }) => {
  await page.keyboard.press('m')
  const card = page.locator('[data-shape-type="musing"]')
  await expect(card).toHaveCount(1)
})

test('clicking text area opens textarea', async ({ page }) => {
  await page.keyboard.press('m')
  const card = page.locator('[data-shape-type="musing"]')
  await expect(card).toHaveCount(1)
  const textArea = card.locator('[data-musing-text]')
  await textArea.click()
  await expect(card.locator('textarea')).toBeFocused()
})

test('typing in textarea persists text', async ({ page }) => {
  await page.keyboard.press('m')
  const card = page.locator('[data-shape-type="musing"]')
  await expect(card).toHaveCount(1)
  await card.locator('[data-musing-text]').click()
  const ta = card.locator('textarea')
  await ta.fill('A quiet reflection')
  await ta.blur()
  // After blur, the text is rendered as a paragraph
  await expect(card.locator('[data-musing-text]')).toContainText('A quiet reflection')
})
