import { test, expect, shot } from "../v7c/fixtures";
import type { Locator, Page } from "@playwright/test";

/**
 * V8 Bring Your Own Deal — invite-only journey (desktop 1440x900 + mobile 390x844).
 * Reuses the V7C magic-link storage state. Requires the Preview to have
 * BYOD_FOUNDING_BETA_ENABLED=true and the UAT email in FOUNDING_BETA_EMAILS.
 */
async function tap(l: Locator) {
  await l.scrollIntoViewIfNeeded();
  await l.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await l.click();
}
async function ensureBuyBox(page: Page): Promise<void> {
  const existing = await page.request.get("/api/investment/profile");
  const body = existing.ok() ? await existing.json() : null;
  const first = body && Array.isArray(body.profiles) ? body.profiles[0] : null;
  const inputs = {
    maxPrice: 1_700_000, deposit: 900_000, strategy: "growth", acceptableWeeklyHoldingCost: 1_500,
    propertyType: "house", states: ["SA"], riskTolerance: "medium", holdingPeriodYears: 10,
  };
  if (first?.id) {
    await page.request.patch("/api/investment/profile", { data: { id: first.id, name: "V8 UAT buy box", inputs } });
  } else {
    await page.request.post("/api/investment/profile", { data: { name: "V8 UAT buy box", inputs } });
  }
}
async function fillForm(page: Page, opts: { beds?: string } = {}) {
  await page.getByLabel(/listing url/i).fill("https://www.example-realestate.com.au/property/byod-uat-1");
  await page.getByLabel(/^address$/i).fill("12 UAT St, Grange SA 5022");
  await page.getByLabel(/suburb/i).selectOption({ index: 0 }); // Grange (first seeded SA suburb)
  await page.getByLabel(/property type/i).selectOption("house");
  await page.getByLabel(/beds/i).fill(opts.beds ?? "3");
  await page.getByLabel(/baths/i).fill("1");
  await page.getByLabel(/parking/i).fill("2");
  await page.getByLabel(/land m/i).fill("620");
  await page.getByLabel(/price display/i).selectOption("exact");
  await page.getByLabel(/price \(a\$\)/i).fill("800000");
  await page.getByLabel(/listing status/i).selectOption("for_sale");
}

test.beforeEach(async ({ page }) => { await ensureBuyBox(page); });

test("BYOD 01 invite-only entry form renders with reference-only URL note", async ({ page }, testInfo) => {
  await page.goto("/byod");
  await expect(page.getByRole("heading", { name: /bring your own deal/i })).toBeVisible();
  await expect(page.getByText(/founding beta/i).first()).toBeVisible();
  await expect(page.getByText(/reference only.*never fetched|never read the listing/i).first()).toBeVisible();
  await shot(page, testInfo.project.name, "byod-01-form");
});

test("BYOD 02 analyse a complete SA house → class-labelled deal + one-page brief", async ({ page, guards }, testInfo) => {
  await page.goto("/byod");
  await fillForm(page);
  await tap(page.getByRole("button", { name: /analyse against my buy box/i }));
  await expect(page.getByText(/^Deal \d/i).first()).toBeVisible();
  await shot(page, testInfo.project.name, "byod-02-result");
  // Evidence classes are visibly labelled.
  await tap(page.getByRole("button", { name: /deal brief/i }));
  const drawer = page.getByRole("dialog", { name: /deal brief/i });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/your fact/i).first()).toBeVisible();
  await expect(drawer.getByText(/official evidence|missing/i).first()).toBeVisible();
  await expect(drawer.getByText(/not financial, legal, lending or tax advice/i)).toBeVisible();
  await shot(page, testInfo.project.name, "byod-03-brief");
  if (testInfo.project.name === "mobile") {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal overflow on mobile").toBeLessThanOrEqual(1);
  }
  expect(guards.consoleErrors, "no console errors").toEqual([]);
});

test("BYOD 03 incomplete facts require explicit confirmation before scoring", async ({ page }, testInfo) => {
  await page.goto("/byod");
  await fillForm(page, { beds: "" }); // leave bedrooms blank
  await tap(page.getByRole("button", { name: /analyse against my buy box/i }));
  const confirm = page.getByRole("dialog", { name: /confirm incomplete facts/i });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/some facts are missing/i)).toBeVisible();
  await shot(page, testInfo.project.name, "byod-04-confirm");
  await tap(confirm.getByRole("button", { name: /confirm & score anyway/i }));
  await expect(page.getByText(/^Deal \d/i).first()).toBeVisible();
});

test("BYOD 04 save to review persists via the pipeline API", async ({ page }) => {
  await page.goto("/byod");
  await fillForm(page);
  await tap(page.getByRole("button", { name: /analyse against my buy box/i }));
  await tap(page.getByRole("button", { name: /save to review/i }));
  await expect(page.getByText(/saved to your pipeline/i)).toBeVisible();
  const pipeline = await page.request.get("/api/dealhunter/pipeline");
  expect(pipeline.ok()).toBeTruthy();
  const body = await pipeline.json();
  expect((body.items ?? []).some((i: { listing_key: string }) => i.listing_key.startsWith("user-entered:"))).toBeTruthy();
});
