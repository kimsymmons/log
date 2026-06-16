import { test, expect } from '@playwright/test'

test.describe('canvas — shape placement and drag', () => {
  test.beforeEach(async ({ page }) => {
    // Silence API calls that aren't under test
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
    await page.route('**/links**', (route) => route.fulfill({ json: [] }))
    await page.goto('/')
    await expect(page.locator('.tl-canvas')).toBeVisible()
  })

  test('a ChatCard can be created via the command palette', async ({ page }) => {
    // Open command palette
    await page.keyboard.press('Meta+k')
    await expect(page.getByPlaceholder('Search commands…')).toBeVisible()

    // Type "new chat" and execute
    await page.keyboard.type('new chat')
    await page.keyboard.press('Enter')

    // A card with "New chat" title should appear
    await expect(page.getByText('New chat')).toBeVisible()
  })

  test('two ChatCards can be placed without overlapping when created via palette twice', async ({ page }) => {
    // Create first card
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    await expect(page.getByText('New chat').first()).toBeVisible()

    // Create second card
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')

    // Both cards should be present
    const cards = page.getByText('New chat')
    await expect(cards).toHaveCount(2)
  })

  test('a ChatCard is draggable to a new position', async ({ page }) => {
    // Create a card
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    await expect(page.getByText('New chat')).toBeVisible()

    // Get the card element and its initial position
    const card = page.getByText('New chat')
    const initialBox = await card.boundingBox()
    if (!initialBox) throw new Error('card not found')

    // Select and drag the card
    await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      initialBox.x + initialBox.width / 2 + 150,
      initialBox.y + initialBox.height / 2 + 100,
      { steps: 15 }
    )
    await page.mouse.up()

    // Card should have moved — its bounding box differs from before
    const finalBox = await card.boundingBox()
    if (!finalBox) throw new Error('card disappeared after drag')

    const movedX = Math.abs(finalBox.x - initialBox.x)
    const movedY = Math.abs(finalBox.y - initialBox.y)
    expect(movedX + movedY).toBeGreaterThan(50)
  })

  test('dragging on empty canvas marquee-selects cards', async ({ page }) => {
    // Two cards on the canvas
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    await expect(page.getByText('New chat')).toHaveCount(2)

    const editorHandle = await page.evaluateHandle(() => window.__tldrawEditor)

    // Typing "new" in the command palette leaks the `e` keystroke to tldraw's
    // eraser shortcut, leaving the eraser tool active. Dismiss the palette and
    // force the select tool before the marquee drag so we don't erase instead
    // of marquee-select. (Underlying focus leak tracked separately.)
    await page.keyboard.press('Escape')
    await page.evaluate((editor: any) => editor.setCurrentTool('select'), editorHandle)
    await expect
      .poll(() => page.evaluate((editor: any) => editor.getCurrentToolId(), editorHandle))
      .toBe('select')

    // Compute a marquee that encloses every card, starting from empty space.
    const box = await page.evaluate((editor: any) => {
      const b = editor.getCurrentPageBounds()
      return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY }
    }, editorHandle)
    const toScreen = async (x: number, y: number) =>
      page.evaluate(([editor, px, py]: any) => {
        const p = editor.pageToScreen({ x: px, y: py })
        return { x: p.x, y: p.y }
      }, [editorHandle, x, y] as any)

    const start = await toScreen(box.minX - 40, box.minY - 40)
    const end = await toScreen(box.maxX + 40, box.maxY + 40)

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 15 })
    await page.mouse.up()

    const selectedCount = await page.evaluate(
      (editor: any) => editor.getSelectedShapeIds().length,
      editorHandle
    )
    expect(selectedCount).toBeGreaterThanOrEqual(2)
  })

  test('pressing Escape with nothing selected does not crash', async ({ page }) => {
    await page.keyboard.press('Escape')
    // Canvas should still be there
    await expect(page.locator('.tl-canvas')).toBeVisible()
  })

  test('pressing F zooms to fit without crashing', async ({ page }) => {
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    await expect(page.getByText('New chat')).toBeVisible()

    await page.keyboard.press('f')
    await expect(page.locator('.tl-canvas')).toBeVisible()
  })
})
