import { test, expect } from '@playwright/test'

// Thread-card feature: load chat threads from the backend, tag them, link them.
const msgs = (arr: string[]) =>
  JSON.stringify(arr.map((c, i) => ({ role: i % 2 ? 'assistant' : 'user', content: c })))

test.describe('thread cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/ink/strokes', (r) => r.fulfill({ json: [] }))
    await page.route('**/links**', (r) => r.fulfill({ json: [] }))
    await page.route('**/artifacts**', (r) =>
      r.fulfill({
        json: [
          {
            id: 'a1',
            type: 'chat',
            title: 'Backlinks debate',
            created_at: Date.now() - 2 * 3600 * 1000,
            content: msgs(['ship backlinks?', 'maybe', 'and tags?', 'strong no — scope risk.']),
          },
          {
            id: 'a2',
            type: 'chat',
            title: 'Tagging model',
            created_at: Date.now() - 5 * 3600 * 1000,
            content: msgs(['how do tags link?', 'shared tag => connection']),
          },
        ],
      }),
    )
    await page.goto('/')
    await page.waitForFunction(() => (window as unknown as { __tldrawEditor?: unknown }).__tldrawEditor != null)
  })

  test('loads stored chat threads as Thread cards with a reply/time meta', async ({ page }) => {
    await expect(page.getByText('Backlinks debate')).toBeVisible()
    await expect(page.getByText('Tagging model')).toBeVisible()
    // last-message preview + reply count
    await expect(page.getByText('strong no — scope risk.')).toBeVisible()
    await expect(page.getByText(/4 replies ·/)).toBeVisible()
    await expect(page.getByText(/2 replies ·/)).toBeVisible()
  })

  test('the + button creates and attaches a tag chip', async ({ page }) => {
    await page.getByRole('button', { name: 'Add tag' }).first().click()
    const input = page.getByPlaceholder('Add or create a tag…')
    await expect(input).toBeVisible()
    await input.fill('spec')
    await input.press('Enter')
    // chip now present on the card (outside the picker, which we close)
    await page.keyboard.press('Escape')
    await expect(page.getByText('spec')).toBeVisible()
  })

  test('two cards sharing a tag draw a connection line', async ({ page }) => {
    const lineCount = () =>
      page.evaluate(() => document.querySelectorAll('line[stroke-width="1.25"]').length)
    expect(await lineCount()).toBe(0)

    await page.evaluate(() => {
      const ed = (window as unknown as {
        __tldrawEditor: { updateShape: (s: unknown) => void }
      }).__tldrawEditor
      ed.updateShape({ id: 'shape:thread-a1', type: 'chat-card', props: { tags: ['spec'] } })
      ed.updateShape({ id: 'shape:thread-a2', type: 'chat-card', props: { tags: ['spec'] } })
    })

    await expect.poll(lineCount).toBeGreaterThanOrEqual(1)
  })
})
