#!/usr/bin/env node
/**
 * Validate cab placement in the composition, then capture HyperFrames stills.
 */
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(appRoot, '..')
const compositionDir = path.join(root, 'composition')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
}

function startCompositionServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url?.split('?')[0] ?? '/')
        const rel = urlPath === '/' ? '/index.html' : urlPath
        const filePath = path.join(compositionDir, rel)
        if (!filePath.startsWith(compositionDir)) {
          res.writeHead(403)
          res.end()
          return
        }
        const data = await readFile(filePath)
        const ext = path.extname(filePath)
        res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end('not found')
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/` })
    })
  })
}

/** Presentation times (80s storyboard) and approximate car floor for cab checks */
const CHECKS = [
  { time: 5, floor: 1, label: 'terms' },
  { time: 14.2, floor: 4.5, label: 'down-going-up-passing-4-7' },
  { time: 19.2, floor: 9, label: 'down-top-turn' },
  { time: 26.1, floor: 4, label: 'down-4F-board-B' },
  { time: 34.6, floor: 5.5, label: 'down-second-trip-up' },
  { time: 44, floor: 4, label: 'selective-4F-board-B' },
  { time: 48.6, floor: 7, label: 'selective-7F-B-off-C-on' },
  { time: 53.2, floor: 8, label: 'selective-8F-D-board' },
  { time: 70, floor: 1, label: 'stats' },
]

const SNAPSHOT_AT = CHECKS.map((c) => c.time).join(',')

async function assertCabPlacement(baseUrl) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page.on('pageerror', (err) => {
    console.error('Composition page error:', err.message)
  })
  await page.goto(baseUrl, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(800)
  const ready = await page.evaluate(
    () =>
      typeof window.__validateCab === 'function' &&
      Boolean(window.__timelines?.['selective-collective']),
  )
  if (!ready) {
    const diag = await page.evaluate(() => ({
      validate: typeof window.__validateCab,
      timeline: Boolean(window.__timelines?.['selective-collective']),
    }))
    await browser.close()
    throw new Error(`Composition failed to initialize: ${JSON.stringify(diag)}`)
  }

  for (const { time, floor, label } of CHECKS) {
    await page.evaluate((t) => {
      window.__timelines['selective-collective'].seek(t)
    }, time)
    await page.waitForTimeout(150)
    const result = await page.evaluate((f) => window.__validateCab(f), floor)
    if (!result?.ok) {
      await browser.close()
      throw new Error(
        `Cab placement check failed @ ${time}s (${label}): ${result?.error ?? 'unknown'}`,
      )
    }
    console.log(
      `✓ cab @ ${time}s (${label}): ${result.width.toFixed(0)}×${result.height.toFixed(0)}px, center x=${result.cx.toFixed(0)}`,
    )
  }

  await browser.close()
}

const { server, baseUrl } = await startCompositionServer()
try {
  console.log(`Validating cab placement at ${baseUrl}`)
  await assertCabPlacement(baseUrl)

  console.log('Capturing HyperFrames stills…')
  execSync(
    `npx hyperframes@0.8.181 snapshot composition --at ${SNAPSHOT_AT} -o storyboard-stills`,
    { cwd: root, stdio: 'inherit' },
  )
} finally {
  server.close()
}
