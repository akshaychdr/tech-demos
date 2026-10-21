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

const CHECKS = [
  { time: 3, floor: 1, label: 'hook' },
  { time: 10, floor: 9, label: 'down-collective' },
  { time: 20, floor: 8.5, label: 'selective' },
  { time: 34, floor: 9, label: 'stats' },
]

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
    'npx hyperframes@0.8.181 snapshot composition --at 3,10,20,34 -o storyboard-stills',
    { cwd: root, stdio: 'inherit' },
  )
} finally {
  server.close()
}
