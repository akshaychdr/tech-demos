import { expect, test } from "@playwright/test"

test("story replay fires cues", async ({ page }) => {
  page.on("pageerror", (error) => console.log("PAGE", error.message))
  page.on("console", (message) => {
    if (message.type() === "error") console.log("CONSOLE", message.text())
  })

  await page.goto("/tech-demos/backchannel-cue/")
  await expect(page.getByTestId("model-ready")).toBeAttached({ timeout: 120_000 })
  await page.getByRole("button", { name: /A bad morning/ }).click()
  await expect(page.getByTestId("trace-ready")).toBeVisible()
  await page.getByTestId("replay-play").click()
  await expect(page.getByTestId("cue-bubble")).toContainText(/oh no/i)
  await expect(page.getByTestId("cue-log")).toContainText(/about what/i)
  await expect(page.getByTestId("decision-reason")).toBeVisible()
  await page.screenshot({ path: "test-results/replay-cues.png", fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: "test-results/replay-mobile.png", fullPage: false })
})
