/**
 * Full-window 1920×1080 walkthrough + screenshots for PR.
 */
import { chromium } from 'playwright'
import { mkdir, readdir, rename } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs')
const VIEWPORT = { width: 1920, height: 1080 }
const URL = process.env.DEMO_URL || 'http://localhost:5176'

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: 'inherit' })
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`))))
  })
}

async function main() {
  await mkdir(path.join(OUT, 'screenshots'), { recursive: true })
  await mkdir(path.join(OUT, 'video'), { recursive: true })
  const rawDir = path.join(OUT, 'video', 'raw')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: rawDir, size: VIEWPORT },
  })
  const page = await context.newPage()
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(4000)

  const delay = (ms) => page.waitForTimeout(ms)

  await page.screenshot({ path: path.join(OUT, 'screenshots', 'step-0-exploded.png') })
  await delay(1500)

  for (let i = 1; i <= 15; i++) {
    await page.click('[data-next]')
    await delay(3200)
  }
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'step-15-drawers-open.png') })
  await delay(2000)

  await page.click('[data-timeline]')
  await page.keyboard.press('Home')
  await delay(1000)
  for (let i = 0; i < 15; i++) {
    await page.click('[data-next]')
    await delay(2500)
  }
  await page.click('[data-play]')
  await delay(8000)
  await delay(5000)

  await context.close()
  await browser.close()

  const rawFiles = await readdir(rawDir)
  const webm = rawFiles.find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('No recorded webm')
  const rawPath = path.join(rawDir, webm)
  const mp4Path = path.join(OUT, 'video', 'app-demo.mp4')
  await ffmpeg([
    '-y',
    '-i',
    rawPath,
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
