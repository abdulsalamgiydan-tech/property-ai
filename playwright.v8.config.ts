import { defineConfig, devices } from "@playwright/test";

/**
 * V8 SA Founding Beta — Bring Your Own Deal UAT (Playwright).
 *
 * Runs against the SSO-protected Vercel Preview using the Vercel automation-bypass
 * secret (env only) and REUSES the V7C magic-link bootstrap's saved storage state
 * (uat/v7c/.auth/state.json — run `npm run uat:v7c:auth` once first). Deterministic:
 * single worker. Requires the Preview to have BYOD_FOUNDING_BETA_ENABLED=true and the
 * UAT email in FOUNDING_BETA_EMAILS.
 */
const PREVIEW_URL = process.env.VERCEL_PREVIEW_URL ?? "";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const bypassHeaders = BYPASS
  ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" }
  : undefined;

export default defineConfig({
  testDir: "./uat/v8",
  outputDir: "./uat/v8/.artifacts/output",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "uat/v8/.artifacts/report.json" }]],
  use: {
    baseURL: PREVIEW_URL || undefined,
    extraHTTPHeaders: bypassHeaders,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "uat/v7c/.auth/state.json" },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], storageState: "uat/v7c/.auth/state.json" },
    },
  ],
});
