/**
 * Capture full-window screenshots + short demo video for PR validation.
 * Usage: bun run dev (background) then node scripts/capture-artifacts.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs')
const VIEWPORT = { width: 1440, height: 900 }
const URL = process.env.DEMO_URL || 'http://localhost:5174'

async function main() {
  await mkdir(path.join(OUT, 'screenshots'), { recursive: true })
  await mkdir(path.join(OUT, 'video'), { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: path.join(OUT, 'video'), size: VIEWPORT },
  })
  const page = await context.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })

  const shots = [
    { name: 'scene1-layout', tab: '1' },
    { name: 'scene2-curtain', tab: '2' },
    { name: 'scene3-wiring', tab: '3' },
  ]

  for (const s of shots) {
    await page.click(`[data-tab="${s.tab}"]`)
    await page.waitForTimeout(800)
    if (s.tab === '1') {
      await page.click('[data-morph]')
      await page.waitForTimeout(1200)
    }
    if (s.tab === '2') {
      await page.click('[data-explode]')
      await page.waitForTimeout(400)
    }
    if (s.tab === '3') {
      await page.click('[data-run-seq]')
      await page.waitForTimeout(1500)
    }
    await page.screenshot({
      path: path.join(OUT, 'screenshots', `${s.name}.png`),
      fullPage: false,
    })
  }

  await page.waitForTimeout(2000)
  await context.close()
  await browser.close()
  console.log('Artifacts written to', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
