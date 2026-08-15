import { defineConfig, devices } from "@playwright/test";

/**
 * V7C Deal Hunter — isolated Preview UAT (Playwright).
 *
 * Runs against the SSO-protected Vercel Preview using a Vercel automation-bypass
 * secret supplied ONLY via env (never hardcoded/committed). Deterministic: single
 * worker, no parallelism, because the journeys mutate a shared synthetic account.
 *
 * Required env (see docs/decisions/V7C_preview_UAT_evidence.md → "Bypass secret setup"):
 *   VERCEL_PREVIEW_URL                — the exact stable V7C Preview origin
 *   VERCEL_AUTOMATION_BYPASS_SECRET   — Vercel Protection Bypass for Automation secret
 * The secret is sent as request headers; it is never logged or written to disk.
 */
const PREVIEW_URL = process.env.VERCEL_PREVIEW_URL ?? "";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

const bypassHeaders = BYPASS
  ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" }
  : undefined;

export default defineConfig({
  testDir: "./uat/v7c",
  outputDir: "./uat/v7c/.artifacts/output",
  globalSetup: "./uat/v7c/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "uat/v7c/.artifacts/report.json" }],
    ["html", { outputFolder: "uat/v7c/.artifacts/html", open: "never" }],
  ],
  use: {
    baseURL: PREVIEW_URL || undefined,
    extraHTTPHeaders: bypassHeaders,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    // Never store credentials in the browser context beyond the saved storage state.
  },
  projects: [
    // 1) One-time interactive magic-link bootstrap (headed). Saves storage state.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // 2) Desktop journeys. Auth is a one-time manual bootstrap (`npm run uat:v7c:auth`); journeys
    //    reuse the saved storage state and MUST NOT re-trigger the interactive setup, so `setup`
    //    is intentionally not a dependency here.
    {
      name: "desktop",
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "uat/v7c/.auth/state.json",
      },
    },
    // 3) Mobile emulation journeys (~390x844).
    {
      name: "mobile",
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["iPhone 13"],
        storageState: "uat/v7c/.auth/state.json",
      },
    },
  ],
});
