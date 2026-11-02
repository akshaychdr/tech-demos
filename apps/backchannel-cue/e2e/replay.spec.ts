import { expect, test } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"

test("the long story plays and the listener answers out loud", async ({ page }) => {
  const started = Date.now()
  page.on("pageerror", (error) => console.log("PAGE", error.message))

  await page.goto("/tech-demos/backchannel-cue/")
  await expect(page.getByTestId("model-ready")).toBeAttached({ timeout: 120_000 })
  await expect(page.getByTestId("trace-ready")).toBeVisible()
  await expect(page.getByText("The wall")).toHaveCount(0)

  await page.getByTestId("replay-play").click()
  const offsetSec = (Date.now() - started) / 1000
  await expect(page.getByTestId("replay-play")).toHaveAttribute("data-audio-state", "playing")
  await expect(page.getByTestId("cue-bubble").filter({ hasText: "Oh no." })).toBeVisible()
  await expect(page.getByTestId("cue-bubble").filter({ hasText: "Wow." })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("cue-bubble").filter({ hasText: "Haha." })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("cue-bubble").filter({ hasText: "About what?" })).toBeVisible({ timeout: 40_000 })
  await expect(page.getByTestId("cue-bubble").filter({ hasText: "Because?" })).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => {
    const label = document.querySelector("[data-testid='story-time']")?.textContent ?? "0"
    return Number.parseFloat(label) > 71
  }, undefined, { timeout: 40_000 })

  const schedule = JSON.parse((await page.getByTestId("cue-schedule").textContent()) ?? "{}") as {
    story: string
    cues: { at: number; cue: string; file: string }[]
  }
  mkdirSync("test-results", { recursive: true })
  writeFileSync("test-results/sync.json", JSON.stringify({ offsetSec, ...schedule }, null, 2))
  await page.screenshot({ path: "test-results/long-story.png", fullPage: true })
  await expect(page.getByTestId("decision-reason")).toBeVisible()
})
