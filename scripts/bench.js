#!/usr/bin/env node
/**
 * PEO-113 — 500-object pan benchmark
 *
 * Places 500 ChatCard shapes on the canvas, then pans left-to-right and
 * top-to-bottom across the full canvas while measuring P90 fps via
 * requestAnimationFrame timing. Writes results to scripts/bench-results/latest.json
 * and exits non-zero if P90 fps < 55.
 *
 * Usage:
 *   node scripts/bench.js
 *
 * Requires: playwright installed (npm install) and the app buildable with vite.
 */

import { chromium } from 'playwright'
import { createServer } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RESULTS_DIR = path.join(__dirname, 'bench-results')
const TARGET_SHAPES = 500
const MEASURE_DURATION_MS = 5000
const P90_FPS_GATE = 55

async function startViteServer() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5175, strictPort: true },
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
  const url = 'http://localhost:5175'

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__tldrawEditor != null, { timeout: 15000 })

    await page.evaluate((count) => {
      const editor = window.__tldrawEditor
      const cols = 25
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
          body: 'Benchmark body text.',
          timestamp: new Date().toISOString(),
        },
      }))

      editor.createShapes(shapes)
      editor.zoomToFit({ animation: { duration: 0 } })
    }, TARGET_SHAPES)

    await page.waitForTimeout(500)

    // Pan left-to-right across the top half, then top-to-bottom down the right side
    const panPromise = (async () => {
      const { width, height } = await page.viewportSize()
      const marginX = Math.floor(width * 0.1)
      const marginY = Math.floor(height * 0.1)

      // Left to right sweep
      await page.mouse.move(marginX, height / 2)
      await page.mouse.down()
      const hSteps = 40
      const hDelay = (MEASURE_DURATION_MS * 0.5) / hSteps
      for (let i = 0; i <= hSteps; i++) {
        await page.mouse.move(marginX + ((width - 2 * marginX) * i) / hSteps, height / 2)
        await page.waitForTimeout(hDelay)
      }
      await page.mouse.up()

      await page.waitForTimeout(50)

      // Top to bottom sweep
      await page.mouse.move(width / 2, marginY)
      await page.mouse.down()
      const vSteps = 40
      const vDelay = (MEASURE_DURATION_MS * 0.5) / vSteps
      for (let i = 0; i <= vSteps; i++) {
        await page.mouse.move(width / 2, marginY + ((height - 2 * marginY) * i) / vSteps)
        await page.waitForTimeout(vDelay)
      }
      await page.mouse.up()
    })()

    const [frameTimes] = await Promise.all([measureFps(page), panPromise])

    await page.mouse.up().catch(() => {})

    const sorted = [...frameTimes].sort((a, b) => a - b)
    const p90 = Math.round(percentile(sorted, 90))
    const p50 = Math.round(percentile(sorted, 50))
    const minFps = Math.round(sorted[0] ?? 0)
    const passed = p90 >= P90_FPS_GATE

    const result = {
      objects: TARGET_SHAPES,
      frames_sampled: frameTimes.length,
      p50fps: p50,
      p90fps: p90,
      min_fps: minFps,
      gate: P90_FPS_GATE,
      passed,
      timestamp: new Date().toISOString(),
    }

    console.log(JSON.stringify(result, null, 2))

    fs.mkdirSync(RESULTS_DIR, { recursive: true })
    fs.writeFileSync(path.join(RESULTS_DIR, 'latest.json'), JSON.stringify(result, null, 2))

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
