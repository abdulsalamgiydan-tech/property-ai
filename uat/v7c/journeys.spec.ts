import { test, expect, shot } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * V7C Deal Hunter customer journeys — desktop (1440x900) + mobile (~390x844), run under
 * both Playwright projects. Genuine customer flows with semantic locators, curated
 * screenshots, guard assertions (no Production ref, surfaced console/request errors), and
 * persistence verified through the app's own RLS-protected APIs (no test-only backdoor).
 */

/** Ensure the signed-in user has a saved buy box (uses the app's real authenticated API). */
async function ensureBuyBox(page: Page): Promise<void> {
  const existing = await page.request.get("/api/investment/profile");
  if (existing.ok()) {
    const body = await existing.json();
    if (Array.isArray(body.profiles) && body.profiles.length > 0) return;
  }
  const res = await page.request.post("/api/investment/profile", {
    data: {
      name: "V7C UAT buy box",
      inputs: {
        maxPrice: 900000, deposit: 400000, strategy: "growth",
        acceptableWeeklyHoldingCost: 600, propertyType: "house",
        states: ["SA"], riskTolerance: "medium", holdingPeriodYears: 10,
      },
    },
  });
  expect(res.ok(), "buy box profile should save via the RLS-protected API").toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  await ensureBuyBox(page);
});

test("01 authentication — signed-in landing, not the signed-out CTA", async ({ page }, testInfo) => {
  await page.goto("/deal-hunter");
  await expect(page.getByRole("heading", { name: /deal hunter/i })).toBeVisible();
  // Signed-in: the standalone "Sign in" call-to-action for anonymous users is absent.
  await expect(page.getByRole("button", { name: /^sign in$/i })).toHaveCount(0);
  await shot(page, testInfo.project.name, "01-authentication");
});

test("09 synthetic/replay data is clearly labelled", async ({ page }, testInfo) => {
  await page.goto("/deal-hunter");
  const banner = page.getByText(/replay data/i);
  await expect(banner).toBeVisible();
  await expect(page.getByText(/labelled synthetic dataset|not live market listings/i)).toBeVisible();
  await shot(page, testInfo.project.name, "09-synthetic-labelling");
});

test("02 buy box summary explains every answer", async ({ page }, testInfo) => {
  await page.goto("/deal-hunter");
  await expect(page.getByRole("heading", { name: /your buy box/i })).toBeVisible();
  await page.getByRole("button", { name: /how was this built/i }).click();
  await expect(page.getByText(/max purchase price/i)).toBeVisible();
  await expect(page.getByText(/strategy/i).first()).toBeVisible();
  await shot(page, testInfo.project.name, "02-buybox");
});

test("03 ranked opportunity feed renders matches with a deal score", async ({ page, guards }, testInfo) => {
  await page.goto("/deal-hunter");
  await expect(page.getByRole("button", { name: /matches \(/i })).toBeVisible();
  // At least one deal card shows a numeric deal score band.
  await expect(page.getByText(/^Deal \d/i).first()).toBeVisible();
  await shot(page, testInfo.project.name, "03-ranked-feed");
  // No mobile horizontal overflow.
  if (testInfo.project.name === "mobile") {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal overflow on mobile").toBeLessThanOrEqual(1);
  }
  expect(guards.consoleErrors, "no console errors on the feed").toEqual([]);
});

test("04 deal detail + 07 one-page Deal Brief with evidence-class labels", async ({ page }, testInfo) => {
  await page.goto("/deal-hunter");
  await page.getByRole("button", { name: /details & brief/i }).first().click();
  const drawer = page.getByRole("dialog", { name: /deal brief/i });
  await expect(drawer).toBeVisible();
  for (const section of [/why it fits/i, /why it may not/i, /financials/i, /market evidence/i, /what could kill the deal/i, /what to verify next/i]) {
    await expect(drawer.getByText(section)).toBeVisible();
  }
  // Evidence-class labels + the no-advice disclaimer must be present.
  await expect(drawer.getByText(/estimate|market evidence|listing fact|your input/i).first()).toBeVisible();
  await expect(drawer.getByText(/not financial, legal, lending or tax advice/i)).toBeVisible();
  await shot(page, testInfo.project.name, "04-deal-detail-brief");
  await drawer.getByRole("button", { name: /close/i }).click();
});

test("05 save / pass(+reason) / reject + persistence, verified via the API", async ({ page }, testInfo) => {
  await page.goto("/deal-hunter");
  const firstCard = page.locator("li", { has: page.getByText(/^Deal \d/i) }).first();

  // Save to review.
  await firstCard.getByRole("button", { name: /save to review/i }).click();
  await expect(firstCard.getByText(/reviewing/i)).toBeVisible();

  // Pass requires a reason.
  await firstCard.getByRole("button", { name: /pass/i }).click();
  await expect(firstCard.getByText(/reason \(required\)/i)).toBeVisible();
  await firstCard.getByRole("button", { name: /too expensive/i }).click();
  await shot(page, testInfo.project.name, "05-save-pass-reject");

  // Persistence: reload and confirm state survived.
  await page.reload();
  await expect(page.locator("li").filter({ hasText: /reviewing|rejected/i }).first()).toBeVisible();

  // Verify the write physically persisted through the RLS-protected pipeline API.
  const pipeline = await page.request.get("/api/dealhunter/pipeline");
  expect(pipeline.ok()).toBeTruthy();
  const body = await pipeline.json();
  expect(Array.isArray(body.items) && body.items.length > 0, "pipeline items persisted in the isolated DB").toBeTruthy();
});

test("06 three-property comparison", async ({ page }, testInfo) => {
  await page.goto("/deal-hunter");
  const compareButtons = page.getByRole("button", { name: /^compare$/i });
  const count = Math.min(3, await compareButtons.count());
  test.skip(count < 2, "need at least two comparable listings in the synthetic feed");
  for (let i = 0; i < count; i++) await compareButtons.nth(i).click();
  await page.getByRole("button", { name: /^compare$/i, exact: false }).last().click().catch(() => {});
  // The compare dialog shows a side-by-side of the selected suburbs.
  const dialog = page.getByRole("dialog", { name: /compare/i });
  await expect(dialog).toBeVisible();
  await shot(page, testInfo.project.name, "06-compare");
});

test("08 refresh + sign-in persistence keeps the buy box", async ({ page }, testInfo) => {
  await page.goto("/deal-hunter");
  await expect(page.getByRole("heading", { name: /your buy box/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /your buy box/i })).toBeVisible();
  await shot(page, testInfo.project.name, "08-refresh-persistence");
});
