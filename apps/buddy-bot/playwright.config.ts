import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  timeout: 30_000,
  use: {
    baseURL: process.env.BUDDY_ADMIN_URL ?? "http://localhost:8787",
    trace: "on-first-retry",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        }
      : undefined
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] }
    }
  ]
});
