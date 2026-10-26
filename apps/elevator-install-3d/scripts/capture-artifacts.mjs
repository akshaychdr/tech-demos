/**
 * Full-window 1920×1080 demo walkthrough (~55s) + screenshots.
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
const URL = process.env.DEMO_URL || 'http://localhost:5174'

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
  await page.goto(URL, { waitUntil: 'networkidle' })

  const delay = (ms) => page.waitForTimeout(ms)

  // Scene 1 — layout 2D→3D story first
  await page.click('[data-tab="1"]')
  await delay(2000)
  await page.click('[data-view="split"]')
  await delay(800)
  await page.click('[data-morph]')
  await delay(6000)
  const config = page.locator('[data-config]')
  await config.selectOption({ index: 0 })
  await delay(1200)
  await config.selectOption({ index: 12 })
  await delay(1200)
  await config.selectOption({ index: 6 })
  await delay(1200)
  await page.fill('[data-travel]', '4500')
  await delay(800)
  await page.click('[data-morph]')
  await delay(5000)
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'scene1-layout.png') })
  await delay(4000)

  // Scene 2 — steps + explode
  await page.click('[data-tab="2"]')
  await delay(1500)
  for (let i = 0; i < 6; i++) {
    await page.click('[data-next]')
    await delay(2000)
  }
  await page.click('[data-explode]')
  await delay(2500)
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'scene2-curtain.png') })
  await delay(3000)

  // Scene 3 — wiring sequence + motor modes
  await page.click('[data-tab="3"]')
  await delay(1200)
  await page.click('[data-run-seq]')
  await delay(5500)
  await page.selectOption('[data-motor]', 'single')
  await delay(2000)
  await page.selectOption('[data-motor]', 'wye')
  await delay(2000)
  await page.selectOption('[data-hp]', '4')
  await delay(1500)
  await page.selectOption('[data-supply]', '1')
  await delay(1500)
  await page.click('[data-run-seq]')
  await delay(4000)
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'scene3-wiring.png') })

  await delay(6000)
  await context.close()
  await browser.close()

  const files = await readdir(rawDir)
  const webm = files.find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('No webm recording')
  const webmPath = path.join(rawDir, webm)
  const mp4Path = path.join(OUT, 'video', 'app-demo.mp4')
  await ffmpeg([
    '-y',
    '-i',
    webmPath,
    '-vf',
    'fps=60',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4Path,
  ])
  console.log('Wrote', mp4Path)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
