#!/usr/bin/env node
/** Verify cab Y moves smoothly when timeline is seeked (0.25s steps). */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const compositionDir = path.join(root, 'composition')
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
}

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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end()
  }
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.waitForFunction(
  () =>
    typeof window.__applyPresentationTime === 'function' &&
    Boolean(window.__timelines?.['selective-collective']),
  { timeout: 60000 },
)

const samples = await page.evaluate(() => {
  const tl = window.__timelines['selective-collective']
  const car = document.getElementById('car')
  const out = []
  for (let t = 13.5; t <= 16; t += 0.25) {
    tl.seek(t)
    const y = car.getBoundingClientRect().top
    out.push({ t, y })
  }
  return out
})

let maxJump = 0
for (let i = 1; i < samples.length; i++) {
  maxJump = Math.max(maxJump, Math.abs(samples[i].y - samples[i - 1].y))
}
const monotonicUp = samples.every((s, i) => i === 0 || s.y <= samples[i - 1].y + 2)

await browser.close()
server.close()

if (maxJump > 72) {
  console.error('Cab teleported: max Y jump per 0.25s =', maxJump, samples)
  process.exit(1)
}
if (!monotonicUp) {
  console.error('Expected upward travel; samples:', samples)
  process.exit(1)
}
console.log('✓ motion smooth (max ΔY/0.25s =', maxJump.toFixed(1), 'px)')
