import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Playwright global setup for the visual harness.
 *
 * Exchanges the shared TEST_BYPASS_TOKEN for a real JWT via the backend's
 * /auth/test-token endpoint, then writes it to e2e/.auth/token.json for specs
 * to seed into localStorage.auth_token.
 *
 * The backend (Express) is a separate origin from the frontend (BASE_URL):
 *   - BASE_URL      → the frontend under test (Vercel / Vite dev server)
 *   - TEST_API_URL  → the backend that issues the JWT (Fly.io / local :3001)
 *
 * If the bypass is unavailable (no backend running, or TEST_BYPASS_TOKEN unset),
 * setup logs a warning and writes an empty token. The canvas renders without
 * auth, so visual baselines still run — only authenticated API calls are skipped.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOKEN_PATH = join(__dirname, '.auth', 'token.json')

async function globalSetup(): Promise<void> {
  const apiUrl = process.env.TEST_API_URL ?? 'http://localhost:3001'
  const bypassToken = process.env.TEST_BYPASS_TOKEN

  await mkdir(dirname(TOKEN_PATH), { recursive: true })

  let token = ''

  if (!bypassToken) {
    console.warn(
      '[global-setup] TEST_BYPASS_TOKEN is not set — skipping auth bypass. ' +
        'Visual baselines will run unauthenticated.',
    )
  } else {
    try {
      const res = await fetch(`${apiUrl}/auth/test-token`, {
        method: 'POST',
        headers: { 'X-Test-Token': bypassToken },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const body = (await res.json()) as { token?: string }
      if (!body.token) throw new Error('response missing token')
      token = body.token
      console.log(`[global-setup] obtained test JWT from ${apiUrl}`)
    } catch (err) {
      console.warn(
        `[global-setup] could not reach ${apiUrl}/auth/test-token (${String(err)}). ` +
          'Visual baselines will run unauthenticated.',
      )
    }
  }

  await writeFile(TOKEN_PATH, JSON.stringify({ token }, null, 2))
}

export default globalSetup
