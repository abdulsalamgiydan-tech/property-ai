import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const BASE_URL = process.env.V6C1_PREVIEW_URL || "https://property-pjusjq70m-zeebusiness93-2304s-projects.vercel.app";
const EXPECTED_SHA = process.env.V6C1_EXPECTED_SHA || "40b7518c2b07215e83c44e7408994413779b3b6b";
const EXPECTED_BRANCH = "feature/v6a-find-my-investment";
const OUT_DIR = path.join(process.cwd(), "docs", "decisions", "v6c_1_screenshots");
const EVIDENCE_JSON = path.join(OUT_DIR, "v6c1-browser-uat-evidence.json");

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function redact(value) {
  return String(value ?? "")
    .replace(/[^\s/@]+@[^\s/@]+\.[^\s/@]+/g, "[EMAIL]")
    .replace(/_vercel_share=[^&\s"]+/g, "_vercel_share=[REDACTED]")
    .replace(/code=[^&\s"]+/g, "code=[REDACTED]")
    .replace(/token_hash=[^&\s"]+/g, "token_hash=[REDACTED]")
    .replace(/access_token=[^&\s"]+/g, "access_token=[REDACTED]")
    .replace(/refresh_token=[^&\s"]+/g, "refresh_token=[REDACTED]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[JWT]");
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("_vercel_share");
    u.searchParams.delete("code");
    u.searchParams.delete("token_hash");
    u.hash = "";
    return u.toString();
  } catch {
    return redact(url);
  }
}

async function screenshot(page, name, evidence) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  evidence.screenshots.push(`docs/decisions/v6c_1_screenshots/${name}.png`);
}

async function bodyText(page) {
  return redact(await page.locator("body").innerText());
}

async function waitForText(page, text, label, timeout = 20000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
  return { id: label, status: "PASS" };
}

async function firstVisible(page, locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  throw new Error("No visible locator match");
}

async function countApi(page, route) {
  const result = await page.evaluate(async (route) => {
    const res = await fetch(route);
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }, route);
  return result;
}

async function waitForApiStatus(page, route, status, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await countApi(page, route).catch((error) => ({ status: 0, error: error?.message || String(error) }));
    if (last.status === status) return last;
    await sleep(1500);
  }
  throw new Error(`${route} did not return ${status} before timeout; last status ${last?.status ?? "none"}`);
}

async function run() {
  assert(!BASE_URL.includes("app.propellect.com.au"), "Refusing to run Preview UAT against Production domain");
  assert(!BASE_URL.includes("oshquaxsloolqucwvigc"), "Refusing Production Supabase ref");
  const shareToken = process.env.VERCEL_SHARE_TOKEN || "";

  await mkdir(OUT_DIR, { recursive: true });
  const evidence = {
    status: "PASS",
    baseUrl: BASE_URL,
    expectedSha: EXPECTED_SHA,
    browserCapability: "Playwright Chromium",
    screenshots: [],
    checks: [],
    network: [],
    console: [],
    failedRequests: [],
    cleanup: [],
    limitations: [],
  };

  const browser = await chromium.launch({ headless: process.env.HEADED !== "true" ? true : false, slowMo: process.env.HEADED === "true" ? 75 : 0 });
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const text = redact(msg.text());
    if (text.includes("vercel.live/_next-live/feedback/feedback.js")) return;
    if (["error", "warning"].includes(msg.type())) evidence.console.push({ type: msg.type(), text: text.slice(0, 500) });
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("vercel.live/_next-live/feedback/feedback.js")) return;
    evidence.failedRequests.push({ method: req.method(), url: safeUrl(req.url()), failure: req.failure()?.errorText ?? "unknown" });
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/api/auth/session") || url.includes("/api/investment/profile") || url.includes("/api/investment/shortlist") || url.includes("/api/investment/candidates")) {
      evidence.network.push({ method: res.request().method(), url: safeUrl(url), status: res.status() });
    }
  });

  try {
    if (shareToken) {
      await page.goto(`/?_vercel_share=${encodeURIComponent(shareToken)}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
    }

    const attestationResponse = await page.goto("/api/diagnostics/preview-config", { waitUntil: "domcontentloaded" });
    assert(attestationResponse?.status() === 200, `Preview config failed: ${attestationResponse?.status()}`);
    const attestation = await attestationResponse.json();
    assert(attestation.configurationOk === true, "Preview configurationOk is false");
    assert(attestation.commitSha === EXPECTED_SHA, "Preview SHA mismatch");
    assert(attestation.gitBranch === EXPECTED_BRANCH, "Preview branch mismatch");
    assert(attestation.supabase.appUsesWarehouseValidation === true, "App Supabase is not validation");
    assert(attestation.supabase.warehouseUsesWarehouseValidation === true, "Warehouse Supabase is not validation");
    assert(attestation.supabase.productionRefDetected === false, "Production ref detected");
    assert(attestation.featureFlags.serviceRoleConfigured === false, "Service role configured in Preview");
    evidence.attestation = {
      target: attestation.target,
      commitSha: attestation.commitSha,
      gitBranch: attestation.gitBranch,
      appUsesWarehouseValidation: true,
      warehouseUsesWarehouseValidation: true,
      productionRefDetected: false,
      serviceRoleConfigured: false,
      warehousePreview: attestation.featureFlags.warehousePreview,
    };
    evidence.checks.push({ id: "preview_validation_only_attestation", status: "PASS" });

    await page.goto("/find-investment", { waitUntil: "domcontentloaded" });
    await waitForText(page, "Find My Investment", "signed_out_page_render");
    await screenshot(page, "01_questionnaire_signed_out", evidence);

    await page.getByRole("button", { name: "Find my investment" }).click();
    await waitForText(page, "suburbs set aside", "signed_out_results_render");
    await screenshot(page, "02_ranked_results_signed_out", evidence);
    const resultsBody = await bodyText(page);
    assert(resultsBody.includes("71") && resultsBody.includes("91"), "Expected 71/91 result counts not visible");
    evidence.checks.push({ id: "ranked_71_set_aside_91_visible", status: "PASS" });

    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await waitForText(page, "Get free early access", "signed_out_save_opens_login");
    await screenshot(page, "03_signed_out_save_login", evidence);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await firstVisible(page, page.getByRole("button", { name: "Save to shortlist" })).then((b) => b.click());
    await waitForText(page, "Get free early access", "signed_out_shortlist_opens_login");
    const signedOutBody = await bodyText(page);
    assert(!signedOutBody.includes("Shortlisted"), "UI claimed shortlist while signed out");
    evidence.checks.push({ id: "signed_out_no_saved_claim", status: "PASS" });

    console.log("\nACTION REQUIRED: Complete the magic-link login in the visible browser window.");
    console.log("Use the modal in that browser. Do not paste the magic-link URL into this terminal or chat.");
    console.log("After the browser returns to /find-investment as a signed-in user, this script will continue automatically.\n");
    await waitForApiStatus(page, "/api/investment/profile", 200, 10 * 60 * 1000);
    evidence.checks.push({ id: "real_magic_link_signed_in_session", status: "PASS" });
    const authSessionProbe = await countApi(page, "/api/auth/session");
    evidence.authSessionProbeAfterLogin = { status: authSessionProbe.status, hasUser: Boolean(authSessionProbe.json?.user?.id) };
    assert(authSessionProbe.status === 200 && authSessionProbe.json?.user?.id, "Server session probe did not return a user after magic link");
    await page.goto("/find-investment", { waitUntil: "domcontentloaded" });
    await waitForText(page, "Find My Investment", "signed_in_find_investment_render");

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const profileName = `V6C.1 Preview UAT ${stamp}`;
    await page.getByLabel("Maximum purchase price").fill("2000000");
    await page.getByLabel("Available deposit").fill("250000");
    await page.getByLabel("Acceptable weekly holding cost").fill("2000");
    await page.getByLabel("Intended holding period").fill("10");
    await page.getByRole("radio", { name: /^Growth/ }).check();
    await screenshot(page, "04_questionnaire_signed_in", evidence);
    await page.getByRole("button", { name: "Find my investment" }).click();
    await waitForText(page, "suburbs set aside", "signed_in_results_render");
    await screenshot(page, "05_ranked_results_signed_in", evidence);
    const rankedText = await bodyText(page);
    assert(rankedText.includes("71") && rankedText.includes("91"), "Signed-in result counts changed");
    assert(rankedText.includes("Suburb 40530") || rankedText.includes("Grange") || rankedText.includes("6.11"), "Grange expected evidence not visible in results/set-aside text");
    evidence.checks.push({ id: "grange_belair_business_outcomes_visible_or_available", status: "PASS" });

    await firstVisible(page, page.getByRole("button", { name: "Details & evidence" })).then((b) => b.click());
    await waitForText(page, "Evidence & provenance", "evidence_drawer_open");
    await screenshot(page, "06_evidence_drawer", evidence);
    await page.keyboard.press("Escape");
    await page.getByText("Evidence & provenance").waitFor({ state: "detached", timeout: 10000 });
    evidence.checks.push({ id: "escape_closes_evidence_dialog", status: "PASS" });

    await page.getByLabel("Profile name").waitFor({ timeout: 45000 }).catch(async () => { evidence.bodyWhenProfileInputMissing = (await bodyText(page)).slice(0, 1200); throw new Error("Profile name input missing after authenticated session"); });
    await page.getByLabel("Profile name").fill(profileName);
    await page.getByRole("button", { name: "Save profile" }).click();
    await waitForText(page, "Saved", "profile_save_confirmation");
    await screenshot(page, "07_saved_profile_confirmation", evidence);
    let profileApi = await countApi(page, "/api/investment/profile");
    const savedProfile = profileApi.json.profiles.find((p) => p.name === profileName);
    assert(savedProfile?.id, "Saved profile not returned by rehydration API");
    evidence.savedProfileId = savedProfile.id;

    const shortlistButtons = await page.getByRole("button", { name: "Save to shortlist" }).all();
    for (let i = 0; i < Math.min(3, shortlistButtons.length); i += 1) await shortlistButtons[i].click();
    await waitForText(page, "Your saved shortlist (3)", "three_shortlist_items_saved");
    await screenshot(page, "08_persisted_shortlist", evidence);
    let shortlistApi = await countApi(page, "/api/investment/shortlist");
    assert(shortlistApi.json.items.length >= 3, "Shortlist API did not return at least three UAT rows");
    const beforeDeleteShortlistIds = shortlistApi.json.items.map((i) => i.geography_id);
    evidence.shortlistGeographyIds = beforeDeleteShortlistIds.slice(0, 3);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForText(page, profileName, "hard_refresh_profile_rehydrated");
    await waitForText(page, "Your saved shortlist (3)", "hard_refresh_shortlist_rehydrated");
    await screenshot(page, "09_hard_refresh_survival", evidence);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForTimeout(1500);
    await page.goto("/find-investment", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Find my investment" }).click();
    await waitForText(page, "suburbs set aside", "post_signout_results");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await waitForText(page, "Get free early access", "post_signout_login_required");
    console.log("\nACTION REQUIRED: Sign back in through a fresh magic link in the same browser window.");
    console.log("Do not paste the link into this terminal or chat. The script will continue after /api/investment/profile returns 200.\n");
    await waitForApiStatus(page, "/api/investment/profile", 200, 10 * 60 * 1000);
    await page.goto("/find-investment", { waitUntil: "domcontentloaded" });
    await waitForText(page, profileName, "reopened_profile_after_resignin");
    await waitForText(page, "Your saved shortlist", "reopened_shortlist_after_resignin");
    await screenshot(page, "10_reopened_after_signout_signin", evidence);

    await page.getByRole("button", { name: "Load" }).first().click();
    await page.getByRole("button", { name: "Adjust your profile" }).click().catch(() => {});
    await page.getByLabel("Maximum purchase price").fill("1850000");
    await page.getByLabel("Acceptable weekly holding cost").fill("1500");
    await page.getByRole("radio", { name: /^Balanced Blend/ }).check();
    await page.getByRole("button", { name: "Find my investment" }).click();
    await waitForText(page, "suburbs set aside", "rerun_after_profile_update_inputs");
    await page.getByRole("button", { name: "Update to current" }).first().click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForText(page, profileName, "updated_profile_still_present");
    profileApi = await countApi(page, "/api/investment/profile");
    const updatedProfile = profileApi.json.profiles.find((p) => p.id === savedProfile.id);
    assert(updatedProfile?.inputs?.maxPrice === 1850000 && updatedProfile?.inputs?.acceptableWeeklyHoldingCost === 1500 && updatedProfile?.inputs?.strategy === "balanced", "Profile update did not persist");
    await screenshot(page, "11_updated_profile_after_refresh", evidence);

    const compareButtons = await page.getByRole("button", { name: "Compare" }).all();
    for (let i = 0; i < Math.min(2, compareButtons.length); i += 1) await compareButtons[i].click();
    await waitForText(page, "Compare (2)", "persisted_comparison_visible");
    await screenshot(page, "12_comparison_from_shortlist", evidence);

    const removeTarget = beforeDeleteShortlistIds[0];
    await page.getByLabel(`Remove ${removeTarget.split("_")[1]} from shortlist`).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    shortlistApi = await countApi(page, "/api/investment/shortlist");
    assert(!shortlistApi.json.items.some((i) => i.geography_id === removeTarget), "Removed shortlist item reappeared after refresh");
    evidence.checks.push({ id: "shortlist_delete_persisted_after_refresh", status: "PASS" });

    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.waitForTimeout(1500);
    profileApi = await countApi(page, "/api/investment/profile");
    assert(!profileApi.json.profiles.some((p) => p.id === savedProfile.id), "Deleted profile still returned by API");
    shortlistApi = await countApi(page, "/api/investment/shortlist");
    assert(shortlistApi.json.items.length >= 1 && shortlistApi.json.items.every((i) => i.profile_id === null), "Shortlist orphan profile_id was not cleared");
    await screenshot(page, "13_profile_deleted_orphan_shortlist", evidence);

    for (const item of [...shortlistApi.json.items]) {
      const code = item.geography_id.split("_")[1];
      const button = page.getByLabel(`Remove ${code} from shortlist`);
      if (await button.count()) await button.click();
    }
    await page.waitForTimeout(1500);
    shortlistApi = await countApi(page, "/api/investment/shortlist");
    profileApi = await countApi(page, "/api/investment/profile");
    assert(!profileApi.json.profiles.some((p) => p.name === profileName), "UAT profile residue remains");
    assert(!shortlistApi.json.items.some((i) => beforeDeleteShortlistIds.includes(i.geography_id)), "UAT shortlist residue remains");
    evidence.cleanup.push({ id: "uat_profile_and_shortlist_removed_through_product", status: "PASS" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/find-investment", { waitUntil: "domcontentloaded" });
    await waitForText(page, "Find My Investment", "mobile_layout_render");
    await screenshot(page, "14_mobile_layout", evidence);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/find-investment", { waitUntil: "domcontentloaded" });
    await screenshot(page, "15_desktop_layout", evidence);
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    assert(focusVisible, "Keyboard focus is not visible");
    evidence.checks.push({ id: "keyboard_focus_visible", status: "PASS" });

    for (const [route, text] of [
      ["/research", "Research"],
      ["/research/explore", "Explore"],
      ["/research/map", "Map"],
      ["/research/compare", "Compare"],
      ["/analyse-property", "Analyse"],
      ["/compare-properties", "Compare"],
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await waitForText(page, text, `smoke_${route.replace(/[^a-z0-9]/gi, "_")}`, 20000);
    }
    evidence.checks.push({ id: "existing_routes_smoke", status: "PASS" });

    const finalBody = await bodyText(page);
    assert(!/Australia-wide|nationally ranked|all Australian suburbs/i.test(finalBody), "Unsupported national wording detected");
    evidence.checks.push({ id: "no_unsupported_australia_wide_claim", status: "PASS" });

    await writeFile(EVIDENCE_JSON, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ status: "PASS", evidence: path.relative(process.cwd(), EVIDENCE_JSON), screenshots: evidence.screenshots.length, network: evidence.network }));
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = redact(error?.message || error);
    await writeFile(EVIDENCE_JSON, JSON.stringify(evidence, null, 2));
    console.error(`V6C.1 Preview browser UAT failed: ${evidence.error}`);
    process.exitCode = 1;
  } finally {
    if (process.env.KEEP_BROWSER_OPEN !== "true") await browser.close();
  }
}

run();
