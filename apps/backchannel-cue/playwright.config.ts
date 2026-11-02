import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 90_000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    video: "on",
    viewport: { width: 1280, height: 860 },
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "bun run dev --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173/tech-demos/backchannel-cue/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
