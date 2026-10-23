/**
 * Record PR validation artifacts at a fixed 1440×900 viewport (full app window).
 * Usage: node scripts/record-pr-artifacts.mjs
 * Requires API (:8787) and Vite (:5173) already running.
 */
import { chromium } from 'playwright'
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, '.artifacts')
const VIEWPORT = { width: 1440, height: 900 }
const URL = 'http://127.0.0.1:5173'

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const videoDir = path.join(OUT_DIR, 'video-raw')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: videoDir,
      size: VIEWPORT,
    },
  })
  const page = await context.newPage()

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.getByTestId('render-video').waitFor({ state: 'visible' })

  const screenshotPath = path.join(OUT_DIR, 'elevator-hyperframes-ui.png')
  await page.screenshot({ path: screenshotPath, fullPage: false })

  await page.getByTestId('render-video').click()
  await page.waitForSelector('text=Rendered MP4', { timeout: 600_000 }).catch(() => {
    // Render may fail in CI without API; still capture post-click state
  })
  await page.waitForTimeout(2000)

  await context.close()
  await browser.close()

  const files = await readdir(videoDir)
  const webmName = files.find((f) => f.endsWith('.webm'))
  if (!webmName) {
    throw new Error('No Playwright webm recording found')
  }
  console.log(
    JSON.stringify({
      screenshotPath,
      webmPath: path.join(videoDir, webmName),
      viewport: VIEWPORT,
    }),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
