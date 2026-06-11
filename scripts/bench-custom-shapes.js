#!/usr/bin/env node
/**
 * PEO-110 — tldraw fps benchmark
 *
 * Places 300 ChatCard custom shapes on the canvas, then pans for 3 seconds
 * while measuring frame timing via requestAnimationFrame. Reports P90 fps
 * and asserts it meets the 55 fps gate.
 *
 * Usage:
 *   node scripts/bench-custom-shapes.js
 *
 * Requires: app built (`npm run build`) and a preview server running, OR
 * this script starts its own vite preview server automatically.
 */

import { chromium } from 'playwright'
import { createServer } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TARGET_SHAPES = 300
const MEASURE_DURATION_MS = 3000
const P90_FPS_GATE = 55

async function startViteServer() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5174, strictPort: true },
    logLevel: 'silent',
  })
  await server.listen()
  return server
}

async function measureFps(page) {
  return page.evaluate((durationMs) => {
    return new Promise((resolve) => {
      const frameTimes = []
      let last = performance.now()
      const start = last

      function tick(now) {
        const delta = now - last
        if (delta > 0) frameTimes.push(1000 / delta)
        last = now
        if (now - start < durationMs) {
          requestAnimationFrame(tick)
        } else {
          resolve(frameTimes)
        }
      }
      requestAnimationFrame(tick)
    })
  }, MEASURE_DURATION_MS)
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function run() {
  const server = await startViteServer()
  const url = 'http://localhost:5174'

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle' })

    // Wait for tldraw editor to mount
    await page.waitForFunction(() => window.__tldrawEditor != null, { timeout: 15000 })

    // Place 300 ChatCard shapes in a grid
    await page.evaluate((count) => {
      const editor = window.__tldrawEditor
      const cols = 20
      const cardW = 240
      const cardH = 120
      const gapX = 260
      const gapY = 140

      const shapes = Array.from({ length: count }, (_, i) => ({
        type: 'chat-card',
        x: (i % cols) * gapX,
        y: Math.floor(i / cols) * gapY,
        props: {
          w: cardW,
          h: cardH,
          title: `Chat ${i + 1}`,
          messages: [],
          summary: 'Test body for perf benchmark.',
          createdAt: Date.now(),
        },
      }))

      editor.createShapes(shapes)
      editor.zoomToFit({ animation: { duration: 0 } })
    }, TARGET_SHAPES)

    // Wait one frame for layout to settle after zoom
    await page.waitForTimeout(300)

    // Pan during measurement to stress the renderer
    const panPromise = (async () => {
      const box = await page.viewportSize()
      const cx = box.width / 2
      const cy = box.height / 2
      const steps = 30
      const stepDelay = MEASURE_DURATION_MS / steps

      await page.mouse.move(cx, cy)
      await page.mouse.down()
      for (let i = 0; i < steps; i++) {
        const dx = Math.sin((i / steps) * Math.PI * 2) * 150
        const dy = Math.cos((i / steps) * Math.PI * 2) * 100
        await page.mouse.move(cx + dx, cy + dy)
        await page.waitForTimeout(stepDelay)
      }
      await page.mouse.up()
    })()

    const [frameTimes] = await Promise.all([
      measureFps(page),
      panPromise,
    ])

    await page.mouse.up().catch(() => {})

    const sorted = [...frameTimes].sort((a, b) => a - b)
    const p90 = Math.round(percentile(sorted, 90))
    const p50 = Math.round(percentile(sorted, 50))
    const min = Math.round(sorted[0] ?? 0)
    const passed = p90 >= P90_FPS_GATE

    const result = {
      objects: TARGET_SHAPES,
      frames_sampled: frameTimes.length,
      p50fps: p50,
      p90fps: p90,
      min_fps: min,
      gate: P90_FPS_GATE,
      passed,
    }

    console.log(JSON.stringify(result, null, 2))

    if (!passed) {
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
