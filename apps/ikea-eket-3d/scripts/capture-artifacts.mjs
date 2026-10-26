/**
 * Manual-first capture: every frame + close-up set for PR QA.
 */
import { chromium } from 'playwright'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs')
const VIEWPORT = { width: 1920, height: 1080 }
const BASE = process.env.DEMO_URL || 'http://localhost:5176'
const URL = BASE.includes('?') ? BASE : `${BASE}?capture=1`

const FRAME_HOLD_MS = Number(process.env.FRAME_HOLD_MS || 1400)
const CLOSEUP_EXTRA_MS = 1200

const PR_CLOSEUPS = ['3b', '6b', '7b', '9b', '11b', '12b']

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: 'inherit' })
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`))))
  })
}

async function gotoFrame(page, n) {
  await page.evaluate(async (frame) => {
    await window.__eketViewer.goToFrame(frame, true)
  }, n)
  await page.waitForTimeout(FRAME_HOLD_MS)
}

async function main() {
  await mkdir(path.join(OUT, 'screenshots'), { recursive: true })
  await mkdir(path.join(OUT, 'screenshots', 'qa'), { recursive: true })
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
  await page.waitForFunction(() => window.__eketViewer?.goToFrame, null, { timeout: 180000 })
  await page.waitForTimeout(1500)

  const maxFrame = Number(await page.locator('[data-timeline]').getAttribute('max'))

  const qaLog = []
  for (let f = 0; f <= maxFrame; f++) {
    await gotoFrame(page, f)
    const title = await page.locator('[data-step-title]').textContent()
    const phase = await page.locator('[data-phase-tag]').textContent()
    const subId = title?.split('·')[0]?.trim() ?? `f${f}`
    const ctxPath = path.join(OUT, 'screenshots', 'qa', `frame-${String(f).padStart(2, '0')}-${subId}-context.png`)
    await page.screenshot({ path: ctxPath })

    if (phase === 'Close-up') {
      await page.waitForTimeout(CLOSEUP_EXTRA_MS)
      const cuPath = path.join(
        OUT,
        'screenshots',
        'qa',
        `frame-${String(f).padStart(2, '0')}-${subId}-closeup.png`,
      )
      await page.screenshot({ path: cuPath })
      qaLog.push({ frame: f, subId, context: ctxPath, closeup: cuPath })
    } else {
      qaLog.push({ frame: f, subId, context: ctxPath })
    }

    if (subId === '15b') {
      await page.evaluate(() => window.__eketViewer?.finishShowcase?.())
      await page.waitForTimeout(500)
    }
  }

  const hero = [
    { f: 2, file: 'step-00-flat-pack.png' },
    { f: 7, file: 'step-04-back-context.png' },
    { f: 10, file: 'step-06b-closeup.png' },
    { f: 15, file: 'step-09b-closeup.png' },
    { f: 20, file: 'step-12b-closeup.png' },
    { f: maxFrame, file: 'step-15-drawers-open.png' },
  ]
  for (const { f, file } of hero) {
    await gotoFrame(page, f)
    if (file.includes('15')) await page.evaluate(() => window.__eketViewer?.finishShowcase?.())
    await page.screenshot({ path: path.join(OUT, 'screenshots', file) })
  }

  await writeFile(path.join(OUT, 'screenshots', 'qa', 'manifest.json'), JSON.stringify(qaLog, null, 2))

  await context.close()
  await browser.close()

  const rawFiles = await readdir(rawDir)
  const webm = rawFiles.find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('No recorded webm')
  const webmPath = path.join(rawDir, webm)
  const rawSeconds = await new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webmPath])
    let out = ''
    p.stdout.on('data', (d) => {
      out += d
    })
    p.on('exit', (c) => (c === 0 ? resolve(Number(out.trim())) : reject(new Error(`ffprobe ${c}`))))
  })
  const targetSeconds = Math.min(120, Math.max(60, Number(process.env.VIDEO_SECONDS || 90)))
  const speed = rawSeconds > targetSeconds + 0.5 ? targetSeconds / rawSeconds : 1
  const mp4Path = path.join(OUT, 'video', 'app-demo.mp4')
  await ffmpeg([
    '-y',
    '-i',
    webmPath,
    '-vf',
    `setpts=${speed.toFixed(4)}*PTS,scale=1920:1080`,
    '-r',
    '60',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4Path,
  ])
  console.log('Wrote', mp4Path)
  console.log('Close-up frames:', PR_CLOSEUPS.join(', '))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
