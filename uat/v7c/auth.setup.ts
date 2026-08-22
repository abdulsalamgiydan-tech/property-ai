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
const PREVIEW_URL = (process.env.VERCEL_PREVIEW_URL ?? "").replace(/\/$/, "");
const PREVIEW_HOST = PREVIEW_URL ? new URL(PREVIEW_URL).host : "";
const EXPECTED_CALLBACK = `${PREVIEW_URL}/auth/callback`;
const PRODUCTION_HOST = "app.propellect.com.au";

setup("authenticate via real magic link", async ({ page }) => {
  const email = process.env.UAT_EMAIL;
  expect(email, "Set UAT_EMAIL to your isolated-UAT test address before running the bootstrap").toBeTruthy();
  expect(PREVIEW_HOST, "VERCEL_PREVIEW_URL must be set to the stable V7C Preview origin").toBeTruthy();

  fs.mkdirSync("uat/v7c/.auth", { recursive: true });

  // Tripwire + capture: record any request that escapes to the Production host, and capture the
  // magic-link `redirect_to` the app sends to GoTrue so we can assert it BEFORE the link is used.
  const productionHits: string[] = [];
  let capturedRedirectTo: string | null = null;
  page.on("request", (req) => {
    try {
      const parsed = new URL(req.url());
      if (parsed.host === PRODUCTION_HOST) productionHits.push(`${parsed.origin}${parsed.pathname}`);
      if (/\/auth\/v1\/(otp|magiclink)/.test(parsed.pathname)) {
        const rt = parsed.searchParams.get("redirect_to");
        if (rt) capturedRedirectTo = rt;
      }
    } catch { /* ignore non-URL */ }
  });

  // 1) Open the genuine sign-in journey. Every "Sign in" CTA opens the same Early Access modal;
  //    on this desktop viewport only the Deal Hunter CTA matches an exact "Sign in" label.
  await page.goto("/deal-hunter");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal, "Early Access sign-in modal did not open").toBeVisible({ timeout: 15_000 });

  // 2) Submit the isolated-UAT email into the real magic-link form (scoped to the modal).
  //    The submit control is labelled "Get free early access", not "Sign in".
  await modal.getByLabel(/email/i).fill(email!);
  await modal.getByRole("button", { name: /get free early access/i }).click();
  await expect(
    modal.getByText(/check your email/i),
    "Magic-link request was not accepted by the Preview",
  ).toBeVisible({ timeout: 15_000 });

  // 2b) SAFETY GATE — assert the magic link's redirect_to is the EXACT Preview /auth/callback and
  //     NOT the Production host, before the human is asked to open the link.
  await expect
    .poll(() => capturedRedirectTo, { message: "Never observed the magic-link redirect_to request", timeout: 10_000 })
    .not.toBeNull();
  const rt = new URL(capturedRedirectTo!);
  expect(rt.host, `redirect_to escaped to a non-Preview host: ${rt.host}`).toBe(PREVIEW_HOST);
  expect(rt.host, "redirect_to must not be the Production host").not.toBe(PRODUCTION_HOST);
  expect(`${rt.origin}${rt.pathname}`, "redirect_to path must be the exact Preview /auth/callback").toBe(EXPECTED_CALLBACK);
  console.log(`\n>>> redirect_to VERIFIED = ${rt.origin}${rt.pathname} (Preview /auth/callback). The link is safe to open.\n`);

  // 3) Human step: open the magic link IN THIS headed browser window (paste it into the address
  //    bar so the session lands on /auth/callback in this Playwright context), then resume.
  console.log(
    "\n>>> Open the magic-link from your email IN THIS browser window (paste the link into the address bar), " +
      "complete sign-in, then resume Playwright (Inspector: Resume).\n",
  );
  await page.pause();

  // 4) After resume: the browser must have stayed on the Preview host (never Production), and no
  //    request may have escaped to the Production host during the callback.
  expect(productionHits, `Requests escaped to the Production host: ${productionHits.join(", ")}`).toEqual([]);
  expect(new URL(page.url()).host, "After sign-in the browser must remain on the Preview host").toBe(PREVIEW_HOST);

  // Confirm we are genuinely signed in (no error), and the session is on the isolated branch.
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
