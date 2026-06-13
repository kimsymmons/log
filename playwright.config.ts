import { defineConfig, devices } from '@playwright/test'

// Frontend under test. Default to the live Vercel deployment. Override with
// BASE_URL=http://localhost:5173 to test against the local Vite dev server.
const baseURL = process.env.BASE_URL ?? 'https://log-five-xi.vercel.app'
const isLocal = baseURL.includes('localhost') || baseURL.includes('127.0.0.1')

export default defineConfig({
  testDir: './e2e',
  testMatch: ['e2e/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL,
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Only spin up the local dev server when testing against localhost. When
  // BASE_URL points at a remote deployment, run the specs against it directly.
  webServer: isLocal
    ? {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : undefined,
})
