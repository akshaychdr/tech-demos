#!/usr/bin/env node
/**
 * Record the Vite viewer (1920×1080 iframe of the composition) with timeline playback.
 */
import { chromium } from 'playwright'
import { mkdir, copyFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'out')
const VIEWPORT = { width: 1920, height: 1080 }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))))
  })
}

async function waitForUrl(url, ms = 60000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Server not ready: ${url}`)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const port = process.env.VITE_PORT || '5202'
  const baseUrl = `http://127.0.0.1:${port}/`
  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
  })
  try {
    await waitForUrl(baseUrl)
    const videoDir = path.join(OUT, 'viewer-video-raw')
    await mkdir(videoDir, { recursive: true })

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: videoDir, size: VIEWPORT },
    })
    const page = await context.newPage()
    await page.goto(baseUrl, { waitUntil: 'load' })
    const frame = page.frameLocator('[data-testid="reel-embed"]')
    await frame.locator('#plate').waitFor({ state: 'visible', timeout: 30000 })
    await frame.locator('#car').waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForFunction(
      () => {
        const iframe = document.querySelector('[data-testid="reel-embed"]')
        const doc = iframe?.contentDocument
        const tl = iframe?.contentWindow?.__timelines?.['selective-collective']
        return Boolean(doc?.getElementById('plate') && tl)
      },
      { timeout: 30000 },
    )
    await page.evaluate(() => {
      const iframe = document.querySelector('[data-testid="reel-embed"]')
      const tl = iframe?.contentWindow?.__timelines?.['selective-collective']
      if (!tl) throw new Error('timeline missing in iframe')
      tl.seek(3)
    })
    await page.waitForTimeout(1200)
    await page.screenshot({
      path: path.join(OUT, 'viewer-screenshot.png'),
      fullPage: false,
    })
    await page.evaluate(() => {
      const iframe = document.querySelector('[data-testid="reel-embed"]')
      const tl = iframe?.contentWindow?.__timelines?.['selective-collective']
      if (!tl) throw new Error('timeline missing in iframe')
      tl.seek(0)
      tl.play(0)
    })
    await page.waitForTimeout(86000)
    await context.close()
    await browser.close()

    const webm = (await readdir(videoDir)).find((f) => f.endsWith('.webm'))
    if (!webm) throw new Error('No viewer webm recorded')
    const webmPath = path.join(videoDir, webm)
    const outWebm = path.join(OUT, 'elevator-selective-collective-viewer.webm')
    await copyFile(webmPath, outWebm)
    await run('ffmpeg', [
      '-y',
      '-i',
      outWebm,
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      path.join(OUT, 'elevator-selective-collective-viewer.mp4'),
    ])
    console.log(
      JSON.stringify({
        screenshot: path.join(OUT, 'viewer-screenshot.png'),
        mp4: path.join(OUT, 'elevator-selective-collective-viewer.mp4'),
      }),
    )
  } finally {
    vite.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
