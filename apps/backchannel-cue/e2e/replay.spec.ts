import { expect, test } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"

test("story plays out loud and the listener answers", async ({ page }) => {
  const started = Date.now()
  page.on("pageerror", (error) => console.log("PAGE", error.message))

  await page.goto("/tech-demos/backchannel-cue/")
  await expect(page.getByTestId("model-ready")).toBeAttached({ timeout: 120_000 })
  await expect(page.getByTestId("trace-ready")).toBeVisible()
  await expect(page.getByRole("heading", { name: /answers the pauses/i })).toBeVisible()
  await expect(page.getByText("The wall")).toHaveCount(0)

  await page.getByTestId("replay-play").click()
  const offsetSec = (Date.now() - started) / 1000
  await expect(page.getByTestId("replay-play")).toHaveAttribute("data-audio-state", "playing")
  await expect(page.getByTestId("cue-bubble").filter({ hasText: "Oh no." })).toBeVisible()
  await expect(page.getByTestId("cue-bubble").filter({ hasText: "About what?" })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId("cue-bubble").filter({ hasText: "Mhm." })).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => {
    const label = document.querySelector("[data-testid='story-time']")?.textContent ?? "0"
    return Number.parseFloat(label) > 24
  }, null, { timeout: 20_000 })

  const schedule = JSON.parse((await page.getByTestId("cue-schedule").textContent()) ?? "{}") as {
    story: string
    cues: { at: number; cue: string; file: string }[]
  }
  mkdirSync("test-results", { recursive: true })
  writeFileSync("test-results/sync.json", JSON.stringify({ offsetSec, ...schedule }, null, 2))
  await page.screenshot({ path: "test-results/story-with-cues.png", fullPage: true })
  await expect(page.getByTestId("decision-reason")).toBeVisible()
})
