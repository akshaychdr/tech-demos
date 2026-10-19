/**
 * Record PR validation artifacts at a fixed 1440×900 viewport (no desktop crop).
 * Usage: node scripts/record-pr-artifacts.mjs
 * Requires API (:8765) and Vite (:5173) already running.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
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
  await page.getByRole('button', { name: /Run side-by-side/i }).waitFor({ state: 'visible' })

  const runButton = page.getByRole('button', { name: /Run side-by-side/i })
  await runButton.click()

  // Baseline OOM is quick; AirLLM on CPU can take several minutes.
  await expectRunComplete(page, 600_000)

  const screenshotPath = path.join(OUT_DIR, 'airllm-side-by-side.png')
  await page.screenshot({ path: screenshotPath, fullPage: false })

  await context.close()
  await browser.close()

  const webm = (await import('node:fs/promises')).readdir(videoDir).then((files) =>
    files.find((f) => f.endsWith('.webm')),
  )
  const webmName = await webm
  if (!webmName) {
    throw new Error('No Playwright webm recording found')
  }
  console.log(JSON.stringify({ screenshotPath, webmPath: path.join(videoDir, webmName), viewport: VIEWPORT }))
}

async function expectRunComplete(page, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const running = await page.getByRole('button', { name: /Running comparison/i }).isVisible().catch(() => false)
    if (!running) {
      const baselineFailed = await page
        .locator('text=Full transformers')
        .locator('..')
        .locator('..')
        .getByText(/failed|success/i)
        .first()
        .isVisible()
        .catch(() => false)
      const airllmDone = await page
        .locator('text=AirLLM')
        .locator('..')
        .locator('..')
        .getByText(/success|failed/i)
        .first()
        .isVisible()
        .catch(() => false)
      if (baselineFailed && airllmDone) return
    }
    await page.waitForTimeout(1000)
  }
  throw new Error('Timed out waiting for comparison to finish')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
