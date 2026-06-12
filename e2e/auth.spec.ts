import { test, expect } from '@playwright/test'

test.describe('auth flow', () => {
  test.beforeEach(async ({ page }) => {
    // Silence non-auth API calls
    await page.route('**/ink/strokes', (route) => route.fulfill({ json: [] }))
    await page.route('**/links**', (route) => route.fulfill({ json: [] }))
  })

  test('unauthenticated user sees the sign-in prompt, not the canvas', async ({ page }) => {
    // Mock auth/me as unauthenticated
    await page.route('**/auth/me', (route) =>
      route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
    )

    await page.goto('/')

    // The sign-in UI should be visible; the canvas should not
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
    await expect(page.locator('.tl-canvas')).not.toBeVisible()
  })

  test('entering an email submits a magic-link request', async ({ page }) => {
    let requestCalled = false
    await page.route('**/auth/me', (route) =>
      route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
    )
    await page.route('**/auth/request', async (route) => {
      requestCalled = true
      await route.fulfill({ json: { ok: true } })
    })

    await page.goto('/')

    const emailInput = page.getByRole('textbox', { name: /email/i })
    await emailInput.fill('test@example.com')
    await page.keyboard.press('Enter')

    // A confirmation message should appear
    await expect(page.getByText(/check your email|magic link|sent/i)).toBeVisible({ timeout: 3000 })
    expect(requestCalled).toBe(true)
  })

  test('visiting a valid magic-link token grants access to the canvas', async ({ page }) => {
    // Mock /auth/verify to set a session cookie and return success
    await page.route('**/auth/verify**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Set-Cookie': 'session=e2e-test-token; Path=/' },
        json: { ok: true },
      })
    })

    // After verify succeeds, /auth/me should say the user is logged in
    await page.route('**/auth/me', (route) =>
      route.fulfill({ json: { email: 'test@example.com' } })
    )

    await page.goto('/?token=e2e-magic-token')

    // Canvas should be visible once session is established
    await expect(page.locator('.tl-canvas')).toBeVisible({ timeout: 5000 })
  })

  test('an invalid or expired token shows an error, not the canvas', async ({ page }) => {
    await page.route('**/auth/verify**', (route) =>
      route.fulfill({ status: 401, json: { error: 'Invalid or expired token' } })
    )
    await page.route('**/auth/me', (route) =>
      route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
    )

    await page.goto('/?token=bad-token')

    await expect(page.getByText(/invalid|expired|error/i)).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.tl-canvas')).not.toBeVisible()
  })
})
