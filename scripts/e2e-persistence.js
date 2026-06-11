#!/usr/bin/env node
/**
 * PEO-111 — spatial persistence e2e check.
 *
 * Creates a chat card (awkward float position) and an ink stroke, waits for
 * the debounced save, reloads the page, and asserts both shapes come back
 * with exactly the same position, size, z-order, and content.
 *
 * Usage: node scripts/e2e-persistence.js
 */

import { chromium } from 'playwright'
import { createServer } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const CHAT_X = 123.45678901234567
const CHAT_Y = 0.1 + 0.2 // 0.30000000000000004

async function run() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5175, strictPort: true },
    logLevel: 'silent',
  })
  await server.listen()

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  try {
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__tldrawEditor != null, { timeout: 15000 })

    // Create one chat card and one ink stroke programmatically
    const before = await page.evaluate(([x, y]) => {
      const editor = window.__tldrawEditor
      editor.createShapes([
        {
          type: 'chat-card',
          x,
          y,
          props: { w: 240, h: 120, title: 'Persisted card', messages: [], summary: 'survives reload', createdAt: Date.parse('2026-06-11T00:00:00.000Z') },
        },
        {
          type: 'draw',
          x: 400.25,
          y: 300.75,
          props: {
            segments: [{ type: 'free', points: [{ x: 0, y: 0, z: 0.5 }, { x: 50.5, y: 25.25, z: 0.5 }] }],
            isComplete: true,
          },
        },
      ])
      return editor.getCurrentPageShapes().map((s) => ({
        type: s.type, x: s.x, y: s.y, index: s.index, props: s.props,
      }))
    }, [CHAT_X, CHAT_Y])

    // Wait past the 500ms save debounce
    await page.waitForTimeout(1200)

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__tldrawEditor != null, { timeout: 15000 })
    await page.waitForTimeout(300)

    const after = await page.evaluate(() =>
      window.__tldrawEditor.getCurrentPageShapes().map((s) => ({
        type: s.type, x: s.x, y: s.y, index: s.index, props: s.props,
      }))
    )

    const sort = (arr) => [...arr].sort((a, b) => (a.index < b.index ? -1 : 1))
    const beforeSorted = sort(before)
    const afterSorted = sort(after)

    const checks = {
      shape_count: after.length === before.length,
      chat_x_exact: afterSorted.some((s) => s.type === 'chat-card' && s.x === CHAT_X),
      chat_y_exact: afterSorted.some((s) => s.type === 'chat-card' && s.y === CHAT_Y),
      full_state_identical: JSON.stringify(beforeSorted) === JSON.stringify(afterSorted),
    }
    const passed = Object.values(checks).every(Boolean)

    console.log(JSON.stringify({ before: before.length, after: after.length, checks, passed }, null, 2))
    if (!passed) {
      console.error('MISMATCH before:', JSON.stringify(beforeSorted))
      console.error('MISMATCH after:', JSON.stringify(afterSorted))
      process.exitCode = 1
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
