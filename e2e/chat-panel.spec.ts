import { test, expect } from 'playwright/test'

// Mock the streaming inference endpoint so the panel's auto-send never needs a
// live backend. Returns one delta, a summary, then [DONE].
const SSE_BODY =
  'data: {"delta":"Sure — here is a thought."}\n\n' +
  'data: {"summary":{"title":"Idea","body":"A short summary."}}\n\n' +
  'data: [DONE]\n\n'

test.beforeEach(async ({ page }) => {
  await page.route('**/inference', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: SSE_BODY }),
  )
  await page.route('**/links**', (route) => route.fulfill({ json: [] }))
  await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))

  await page.goto('/')
  await page.waitForSelector('.tlui-menu-zone', { timeout: 15_000 })
  await page.keyboard.press('Escape')
})

test('right-clicking a node shows "Chat about this", which opens the panel; Escape closes it', async ({ page }) => {
  // Create a musing and exit its editor.
  await page.keyboard.press('m')
  await page.keyboard.press('Escape')

  const musing = page.locator('.tl-html-container[data-shape-type="musing"]')
  await expect(musing).toHaveCount(1)

  // Right-click the node → the custom context-menu item appears.
  // (The arrow disambiguates the menu item from the panel header text.)
  await musing.click({ button: 'right' })
  const menuItem = page.getByText('Chat about this →')
  await expect(menuItem).toBeVisible()

  // Panel starts hidden.
  const panel = page.getByTestId('chat-panel')
  await expect(panel).toHaveAttribute('data-open', 'false')

  // Clicking the item opens the panel and seeds the first message.
  await menuItem.click()
  await expect(panel).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('chat-messages').getByText(/Tell me about this idea/)).toBeVisible()

  // Escape closes it.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveAttribute('data-open', 'false')
})

test('the context-menu item does not appear on an empty-canvas right-click', async ({ page }) => {
  // Right-click empty canvas — no single shape selected, so no chat item.
  await page.locator('.tl-canvas').click({ button: 'right', position: { x: 120, y: 320 } })
  // The default context menu opens, but without our item.
  await expect(page.locator('.tlui-menu')).toBeVisible()
  await expect(page.getByText('Chat about this →')).toHaveCount(0)
})
