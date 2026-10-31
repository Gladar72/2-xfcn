import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3210", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3210",
    url: "http://127.0.0.1:3210",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // All API and realtime traffic is intercepted in the browser fixtures.
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3211",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-test-only",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
