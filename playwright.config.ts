import { defineConfig, devices } from "@playwright/test";
const prefix = process.env.BASE_PATH || "/";
export default defineConfig({
  testDir: "tests/web",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: 3,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4173" + prefix,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173" + prefix,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 850 },
        launchOptions: { args: ["--enable-unsafe-swiftshader"] },
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
  ],
});
