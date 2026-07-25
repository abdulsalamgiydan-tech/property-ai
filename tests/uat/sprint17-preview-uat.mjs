import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://property-b0prv0t02-zeebusiness93-2304s-projects.vercel.app";
const EXPECTED_COMMIT = "65406f0db7dad3575fb1457368de7fa72fd47a9e";
const BRANCH = "feature/sprint17-major-product-expansion";
const WAREHOUSE_URL = "https://lzonauinzatmtytyoems.supabase.co";
const PRODUCTION_REF = "oshquaxsloolqucwvigc";
const OUT_DIR = path.join(process.cwd(), "uat-artifacts", "sprint17-browser");

function assert(ok, message) { if (!ok) throw new Error(message); }
function redact(value) {
  return String(value ?? "")
    .replace(/[^\s/@]+@[^\s/@]+/g, "[EMAIL]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[TOKEN]");
}
function envFileValue(text, name) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  if (!line) return null;
  return line.slice(name.length + 1).replace(/^['"]|['"]$/g, "");
}
function bypassHeaders() {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  assert(secret && secret.trim() === secret, "Missing or malformed Preview bypass secret");
  return { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" };
}
function sessionStorage(session) {
  const ref = new URL(WAREHOUSE_URL).hostname.split(".")[0];
  const key = `sb-${ref}-auth-token`;
  const value = JSON.stringify(session);
  const encoded = Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return { key, value, cookie: `base64-${encoded}` };
}
async function signIn(supabase, emailEnv, passwordEnv, label) {
  const email = process.env[emailEnv];
  const password = process.env[passwordEnv];
  assert(email && password, `${label} credentials are missing from the process`);
  const result = await supabase.auth.signInWithPassword({ email, password });
  assert(!result.error && result.data.session?.user?.id, `${label} password sign-in failed`);
  await supabase.auth.signOut();
  return result.data.session;
}
async function responseStatus(page, url, init) {
  return page.evaluate(async ({ url, init }) => {
    const response = await fetch(url, init);
    const body = await response.text();
    return { status: response.status, body: body.slice(0, 2000) };
  }, { url, init });
}
async function visit(page, route, expectedText, checks) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  const body = await page.locator("body").innerText();
  assert(response && response.status() < 500, `${route} returned server failure`);
  if (expectedText) assert(body.includes(expectedText), `${route} missing expected content`);
  checks.push({ id: `route_${route.replace(/[^a-z0-9]+/gi, "_")}`, status: "pass", httpStatus: response?.status() });
}
async function run() {
  const envText = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
  const anonKey = envFileValue(envText, "WAREHOUSE_SUPABASE_ANON_KEY");
  assert(anonKey && envFileValue(envText, "WAREHOUSE_SUPABASE_URL") === WAREHOUSE_URL, "Local warehouse-validation anon configuration is unavailable");
  assert(!BASE_URL.includes("app.propellect.com.au") && !BASE_URL.includes(PRODUCTION_REF), "Unsafe UAT base URL");
  const headers = bypassHeaders();
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  const consoleErrors = [];
  try {
    const publicContext = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: headers, viewport: { width: 1440, height: 980 } });
    const publicPage = await publicContext.newPage();
    publicPage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(redact(message.text())); });
    const attestationResponse = await publicPage.goto("/api/diagnostics/preview-config", { waitUntil: "domcontentloaded" });
    assert(attestationResponse?.status() === 200, "Preview attestation did not respond successfully");
    const attestation = await attestationResponse.json();
    assert(attestation.configurationOk === true && attestation.target === "preview", "Preview attestation failed");
    assert(attestation.commitSha === EXPECTED_COMMIT && attestation.gitBranch === BRANCH, "Preview commit or branch mismatch");
    assert(attestation.supabase?.appUsesWarehouseValidation && attestation.supabase?.warehouseUsesWarehouseValidation, "Preview is not using warehouse-validation");
    assert(attestation.supabase?.productionRefDetected === false, "Production Supabase ref detected in Preview");
    assert(attestation.featureFlags?.adminEmailsConfigured === false && attestation.featureFlags?.serviceRoleConfigured === false, "Preview admin/service role configuration is unsafe");
    assert(attestation.featureFlags?.researchCopilot === true && attestation.featureFlags?.publicApiV1 === true, "Sprint 17 Preview flags are not enabled");
    assert(!JSON.stringify(attestation).includes(WAREHOUSE_URL), "Attestation leaked full Supabase URL");
    checks.push({ id: "preview_configuration_attestation", status: "pass" });
    await visit(publicPage, "/", "Investor-grade tools", checks);
    await visit(publicPage, "/research", "Research Hub", checks);
    await publicContext.close();

    const supabase = createClient(WAREHOUSE_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const userA = await signIn(supabase, "UAT_USER_A_EMAIL", "UAT_USER_A_PASSWORD", "User A");
    const userB = await signIn(supabase, "UAT_USER_B_EMAIL", "UAT_USER_B_PASSWORD", "User B");
    checks.push({ id: "password_auth_user_a", status: "pass", userId: userA.user.id });
    checks.push({ id: "password_auth_user_b", status: "pass", userId: userB.user.id });

    async function makeContext(session, viewport) {
      const ctx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: headers, viewport });
      const storage = sessionStorage(session);
      await ctx.addInitScript(({ key, value, cookie }) => {
        localStorage.setItem(key, value);
        document.cookie = `${key}=${cookie}; path=/; max-age=31536000; secure; samesite=lax`;
      }, storage);
      await ctx.addCookies([{ name: storage.key, value: storage.cookie, domain: new URL(BASE_URL).hostname, path: "/", secure: true, sameSite: "Lax" }]);
      return ctx;
    }
    const ctxA = await makeContext(userA, { width: 1440, height: 980 });
    const ctxB = await makeContext(userB, { width: 1440, height: 980 });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    for (const page of [pageA, pageB]) page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(redact(message.text())); });

    await visit(pageA, "/dashboard", "Dashboard", checks);
    await visit(pageB, "/dashboard", "Dashboard", checks);
    await visit(pageA, "/onboarding", "Investment", checks);
    await visit(pageA, "/settings", "Settings", checks);
    await visit(pageA, "/analyse-property", "Analyse", checks);
    await visit(pageA, "/compare-properties", "Compare", checks);
    await visit(pageA, "/portfolio", "Portfolio", checks);
    await visit(pageA, "/watchlist", "watchlist", checks);
    await visit(pageA, "/research/explore", "Explore", checks);
    await visit(pageA, "/research/suburb/70073", "snapshot", checks);
    await visit(pageA, "/research/postcode/2000", "snapshot", checks);
    await visit(pageA, "/research/map", "Map", checks);
    await visit(pageA, "/research/compare?ids=SAL_70073_ASGS3_2021,SAL_21640_ASGS3_2021", "Compare", checks);
    await visit(pageA, "/research/scenario/70073", "Scenario", checks);
    await visit(pageA, "/research/copilot/70073", "copilot", checks);
    await visit(pageA, "/operations", null, checks);
    await visit(pageA, "/admin", null, checks);
    await visit(pageA, "/definitely-not-a-real-route", "404", checks);

    const apiSearch = await responseStatus(pageA, "/api/v1/search?q=Parramatta&type=SAL&limit=5");
    assert(apiSearch.status === 200, "API v1 search failed");
    const apiInvalid = await responseStatus(pageA, "/api/v1/search?q=x&type=BAD");
    assert(apiInvalid.status === 400, "API v1 invalid type was not rejected");
    checks.push({ id: "api_v1_search_and_validation", status: "pass" });
    const mapInvalid = await responseStatus(pageA, "/api/research/map-markers?minLat=1&maxLat=0&minLng=1&maxLng=0");
    assert(mapInvalid.status >= 400 && mapInvalid.status < 500, "Invalid map bounds were not rejected");
    checks.push({ id: "map_bounds_validation", status: "pass" });

    const feedbackClientSubmissionId = randomUUID();`r`n    const feedback = await responseStatus(pageA, "/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "general", message: `Sprint 17 Preview UAT ${randomUUID()}`, pagePath: "/research", satisfactionScore: 4, contactPermission: false, clientSubmissionId: feedbackClientSubmissionId }) });
    assert(feedback.status === 200, "Preview feedback submission failed");
    checks.push({ id: "feedback_submission", status: "pass" });
    const feedbackInvalid = await responseStatus(pageA, "/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "invalid", message: "" }) });
    assert(feedbackInvalid.status === 400, "Invalid feedback was not rejected");
    checks.push({ id: "feedback_validation", status: "pass" });`r`n    const feedbackCleanup = await supabase.from("user_feedback").delete().eq("user_id", userA.user.id).eq("client_submission_id", feedbackClientSubmissionId);`r`n    assert(!feedbackCleanup.error, "Preview feedback cleanup failed");`r`n    checks.push({ id: "preview_feedback_cleanup", status: "pass" });

    const copilotInvalid = await responseStatus(pageA, "/api/research/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ geographyCode: "70073", question: "" }) });
    assert(copilotInvalid.status === 400, "Copilot invalid input was not rejected");
    checks.push({ id: "copilot_validation_and_route", status: "pass" });

    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.goto("/research", { waitUntil: "domcontentloaded" });
    await pageA.keyboard.press("Tab");
    const focusVisible = await pageA.evaluate(() => { const e = document.activeElement; const r = e?.getBoundingClientRect(); return Boolean(r && r.width > 0 && r.height > 0); });
    assert(focusVisible, "Mobile keyboard focus was not visible");
    checks.push({ id: "mobile_keyboard_smoke", status: "pass" });

    const out = { status: "pass", baseURL: BASE_URL, expectedCommit: EXPECTED_COMMIT, branch: BRANCH, supabaseBranch: "warehouse-validation", users: [{ label: "User A", id: userA.user.id }, { label: "User B", id: userB.user.id }], checks, consoleErrors: consoleErrors.slice(0, 20), cleanup: "browser contexts closed; no production data touched" };
    await ctxA.close(); await ctxB.close();
    await writeFile(path.join(OUT_DIR, "sprint17-preview-uat-evidence.json"), JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ status: out.status, checks: checks.length, consoleErrors: consoleErrors.length, artifact: "uat-artifacts/sprint17-browser/sprint17-preview-uat-evidence.json" }));
  } finally {
    await browser.close();
  }
}
run().catch(async (error) => {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "sprint17-preview-uat-failure.json"), JSON.stringify({ status: "fail", message: redact(error.message) }, null, 2));
  console.error(`Sprint 17 Preview UAT failed: ${redact(error.message)}`);
  process.exit(1);
});


