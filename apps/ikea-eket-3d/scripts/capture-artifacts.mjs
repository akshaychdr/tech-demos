/**
 * Full-window 1920×1080 walkthrough + step screenshots for PR.
 */
import { chromium } from 'playwright'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs')
const VIEWPORT = { width: 1920, height: 1080 }
const BASE = process.env.DEMO_URL || 'http://localhost:5176'
const URL = BASE.includes('?') ? BASE : `${BASE}?capture=1`

const SHOT_STEPS = [
  { step: 0, file: 'step-00-flat-pack.png' },
  { step: 3, file: 'step-03-dowels.png' },
  { step: 6, file: 'step-06-frame.png' },
  { step: 9, file: 'step-09-drawer1.png' },
  { step: 12, file: 'step-12-slides.png' },
  { step: 15, file: 'step-15-drawers-open.png' },
]

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: 'inherit' })
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`))))
  })
}

const STEP_HOLD_MS = Number(process.env.STEP_HOLD_MS || 4200)
const STEP15_HOLD_MS = Number(process.env.STEP15_HOLD_MS || 5500)

async function gotoStep(page, n) {
  await page.locator('[data-timeline]').fill(String(n))
  await page.locator('[data-timeline]').dispatchEvent('input')
  await page.waitForTimeout(n === 15 ? STEP15_HOLD_MS : STEP_HOLD_MS)
}

async function main() {
  await mkdir(path.join(OUT, 'screenshots'), { recursive: true })
  await mkdir(path.join(OUT, 'video'), { recursive: true })
  const rawDir = path.join(OUT, 'video', 'raw')
  await rm(rawDir, { recursive: true, force: true })
  await mkdir(rawDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: rawDir, size: VIEWPORT },
  })
  const page = await context.newPage()
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 180000 })
  await page.waitForTimeout(5000)

  for (const { step, file } of SHOT_STEPS) {
    await gotoStep(page, step)
    if (step === 15) {
      await page.evaluate(() => window.__eketViewer?.finishShowcase?.())
      await page.waitForTimeout(400)
    }
    await page.screenshot({ path: path.join(OUT, 'screenshots', file) })
  }

  for (let s = 0; s <= 15; s++) {
    await gotoStep(page, s)
    if (s === 15) {
      await page.evaluate(() => window.__eketViewer?.finishShowcase?.())
      await page.waitForTimeout(800)
    }
  }
  await page.waitForTimeout(1500)

  await context.close()
  await browser.close()

  const rawFiles = await readdir(rawDir)
  const webm = rawFiles.find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('No recorded webm')
  const mp4Path = path.join(OUT, 'video', 'app-demo.mp4')
  const targetSeconds = Number(process.env.VIDEO_SECONDS || 78)
  await ffmpeg([
    '-y',
    '-i',
    path.join(rawDir, webm),
    '-t',
    String(targetSeconds),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '60',
    '-vf',
    'scale=1920:1080',
    mp4Path,
  ])
  console.log('Wrote', mp4Path)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
