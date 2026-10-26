import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ??
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      process.env.PLAYWRIGHT_PRODUCTION === "true"
        ? "npm run start"
        : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
