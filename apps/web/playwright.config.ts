import { defineConfig, devices } from "@playwright/test";

/**
 * Two-browser online tests. Starts the game server and the web app, then plays a private room
 * from two separate browser contexts. Run with `pnpm e2e` (not part of `pnpm test`).
 * Set PW_CHROMIUM to use an already-installed Chromium instead of Playwright's download.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:3100",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: [
    {
      command: "pnpm --dir ../server start",
      url: "http://localhost:2567/health",
      env: { PORT: "2567" },
      reuseExistingServer: true,
    },
    {
      command: "pnpm exec next dev -p 3100",
      url: "http://localhost:3100",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
