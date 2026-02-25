const { defineConfig } = require("@playwright/test");
const chromiumPath = process.env.E2E_CHROMIUM_PATH || "";

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  workers: 1,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8081",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: chromiumPath
      ? {
          executablePath: chromiumPath,
        }
      : undefined,
  },
});
