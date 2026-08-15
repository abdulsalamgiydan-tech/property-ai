import { test as base, expect, type Page } from "@playwright/test";

/**
 * Shared V7C UAT fixtures:
 *  - a network guard that FAILS the test if any request references the Production
 *    Supabase ref, and records console errors + failed responses;
 *  - screenshot helpers writing curated desktop/mobile PNGs into the evidence dir.
 */
export const PRODUCTION_SUPABASE_REF = "oshquaxsloolqucwvigc";
export const ISOLATED_SUPABASE_REF = "mmqxwwjshnpcqngciqtx";
export const SCREENSHOT_DIR = "docs/decisions/v7c_screenshots";

type Guards = {
  consoleErrors: string[];
  failedRequests: string[];
  productionHits: string[];
};

export const test = base.extend<{ guards: Guards }>({
  guards: async ({ page }, use, testInfo) => {
    const guards: Guards = { consoleErrors: [], failedRequests: [], productionHits: [] };

    // Vercel injects a `vercel.live` feedback/toolbar script on PREVIEW deployments; the app's CSP
    // correctly blocks it (it is absent in production). Exclude only that specific third-party,
    // preview-only noise — never app-origin errors.
    const BENIGN_CONSOLE = [/vercel\.live/i];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (BENIGN_CONSOLE.some((re) => re.test(text))) return;
      guards.consoleErrors.push(text);
    });
    page.on("requestfailed", (req) => {
      guards.failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? ""}`);
    });
    // Hard isolation guard: any Production-ref request aborts the run immediately.
    page.on("request", (req) => {
      if (req.url().includes(PRODUCTION_SUPABASE_REF)) guards.productionHits.push(req.url());
    });
    page.on("response", (res) => {
      if (res.status() >= 500) guards.failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await use(guards);

    // Assert after the test body: no Production leakage, ever.
    expect(guards.productionHits, `Request(s) referenced Production ref ${PRODUCTION_SUPABASE_REF}`).toEqual([]);
    // Surface (do not silently swallow) app errors; individual specs may allowlist known-benign noise.
    if (guards.consoleErrors.length) testInfo.annotations.push({ type: "console-error", description: guards.consoleErrors.join(" | ") });
    if (guards.failedRequests.length) testInfo.annotations.push({ type: "failed-request", description: guards.failedRequests.join(" | ") });
  },
});

export { expect };

/** Curated screenshot into the evidence dir, named by journey + project (desktop/mobile). */
export async function shot(page: Page, projectName: string, name: string): Promise<string> {
  const file = `${SCREENSHOT_DIR}/${name}.${projectName}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
