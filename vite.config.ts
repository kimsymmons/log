import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['dist/**', 'node_modules/**', 'e2e/**'],
    setupFiles: ['./src/tests/setup.ts'],
    environmentMatchGlobs: [
      ['server/**', 'node'],
    ],
    server: {
      deps: {
        // Native modules and CJS-only packages must not be bundled by Vite
        external: ['better-sqlite3', 'express', 'jsonwebtoken', 'resend', 'supertest'],
      },
    },
  },
})
