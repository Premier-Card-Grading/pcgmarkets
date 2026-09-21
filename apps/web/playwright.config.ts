import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 60_000,
  use: {
    baseURL: process.env.SHOTS_BASE_URL ?? "http://localhost:3000",
    storageState: process.env.PW_STORAGE || undefined,
  },
  webServer: process.env.SHOTS_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    { name: "phone-light", use: { ...devices["iPhone 13"], colorScheme: "light" } },
    { name: "phone-dark", use: { ...devices["iPhone 13"], colorScheme: "dark" } },
    { name: "desktop-light", use: { viewport: { width: 1280, height: 900 }, colorScheme: "light" } },
    { name: "desktop-dark", use: { viewport: { width: 1280, height: 900 }, colorScheme: "dark" } },
  ],
});
