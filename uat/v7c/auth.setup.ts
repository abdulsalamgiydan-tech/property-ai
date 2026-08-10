import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import { ISOLATED_SUPABASE_REF } from "./fixtures";

/**
 * One-time interactive authentication bootstrap (run headed: `npm run uat:v7c:auth`).
 *
 * Uses the GENUINE Preview sign-in journey + real magic link. No test-only login route,
 * no fake session, no service-role. The UAT email is provided via env (UAT_EMAIL) and is
 * never written to logs/screenshots. Saves Playwright storage state to a gitignored path.
 */
const AUTH_FILE = "uat/v7c/.auth/state.json";

setup("authenticate via real magic link", async ({ page }) => {
  const email = process.env.UAT_EMAIL;
  expect(email, "Set UAT_EMAIL to your isolated-UAT test address before running the bootstrap").toBeTruthy();

  fs.mkdirSync("uat/v7c/.auth", { recursive: true });

  // 1) Open the genuine sign-in journey.
  await page.goto("/deal-hunter");
  await page.getByRole("button", { name: /sign in/i }).first().click();

  // 2) Submit the isolated-UAT email into the real sign-in form.
  const emailField = page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).first();
  await emailField.fill(email!);
  await page.getByRole("button", { name: /send|sign in|continue|magic/i }).first().click();

  // 3) Human step: complete the real magic link in THIS headed browser, then resume.
  //    (Open the email, click the magic link so it lands on /auth/callback in this window.)
  console.log("\n>>> Complete the magic-link sign-in in the opened browser, then resume Playwright (Inspector: Resume).\n");
  await page.pause();

  // 4) Confirm we are genuinely signed in (no error), and the session is on the isolated branch.
  await expect(page.getByText(/sign in/i)).toHaveCount(0, { timeout: 15_000 }).catch(() => { /* some layouts keep a header link */ });
  const diag = await page.request.get("/api/diagnostics/preview-config");
  const body = await diag.json();
  expect(body.configurationOk, "Preview is not bound to the isolated branch").toBe(true);
  expect(String(body.supabase.appProjectRef)).toContain(ISOLATED_SUPABASE_REF.slice(0, 4));
  expect(body.supabase.productionRefDetected).toBe(false);

  // 5) Persist storage state (gitignored).
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`\n>>> Saved storage state to ${AUTH_FILE} (gitignored). You can now run: npm run uat:v7c\n`);
});
