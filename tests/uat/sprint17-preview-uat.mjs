import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createChunks } = require("C:/Users/abdul/property-ai/node_modules/@supabase/ssr/dist/main/utils/chunker.js");
const { stringToBase64URL } = require("C:/Users/abdul/property-ai/node_modules/@supabase/ssr/dist/main/utils/base64url.js");

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
function createCookieChunks(key, value, chunkSize = 3180) {
  const encoded = encodeURIComponent(value);
  if (encoded.length <= chunkSize) return [{ name: key, value }];
  const chunks = [];
  let remaining = encoded;
  while (remaining.length > 0) {
    let head = remaining.slice(0, chunkSize);
    const lastPercent = head.lastIndexOf("%");
    if (lastPercent > chunkSize - 3) head = head.slice(0, lastPercent);
    let decoded = "";
    while (head.length > 0) {
      try { decoded = decodeURIComponent(head); break; }
      catch { head = head.slice(0, Math.max(0, head.length - 3)); }
    }
    chunks.push({ name: `${key}.${chunks.length}`, value: decoded });
    remaining = remaining.slice(head.length);
  }
  return chunks;
}function sessionStorage(session) {
  const ref = new URL(WAREHOUSE_URL).hostname.split(".")[0];
  const key = `sb-${ref}-auth-token`;
  const value = JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, expires_at: session.expires_at, token_type: session.token_type, user: session.user });
  const encoded = Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return { key, value, cookies: createCookieChunks(key, `base64-${encoded}`) };
}
async function obtainSession(supabase, label, email, expectedId, emailEnv, passwordEnv) {
  const adminKey = process.env.WAREHOUSE_VALIDATION_SUPABASE_SERVICE_ROLE_KEY;
  let password = process.env[passwordEnv];
  if (adminKey) {
    assert(adminKey.trim() === adminKey, "Warehouse-validation admin credential is malformed");
    assert(WAREHOUSE_URL === "https://lzonauinzatmtytyoems.supabase.co" && !WAREHOUSE_URL.includes(PRODUCTION_REF), "Refusing Auth mutation outside warehouse-validation");
    password = `S17Uat!${randomUUID()}${randomUUID().slice(0, 16)}`;
    const admin = createClient(WAREHOUSE_URL, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const repaired = await admin.auth.admin.updateUserById(expectedId, { password, email_confirm: true });
    assert(!repaired.error, `${label} non-Production admin repair failed`);
  }
  if (!password) password = process.env[passwordEnv];
  const result = await supabase.auth.signInWithPassword({ email: email || process.env[emailEnv], password });
  assert(!result.error && result.data.session?.user?.id === expectedId, `${label} password sign-in failed`);
  await supabase.auth.signOut();
  return result.data.session;
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
  let body = await page.locator("body").innerText();
  assert(response && response.status() < 500, `${route} returned server failure`);
  if (expectedText) {
    for (let attempt = 0; attempt < 2 && !body.includes(expectedText); attempt += 1) {
      const deadline = Date.now() + 15000;
      while (!body.includes(expectedText) && Date.now() < deadline) {
        await page.waitForTimeout(300);
        body = await page.locator("body").innerText();
      }
      if (!body.includes(expectedText) && attempt === 0) {
        await page.reload({ waitUntil: "domcontentloaded" });
        body = await page.locator("body").innerText();
      }
    }
    assert(body.includes(expectedText), `${route} missing expected content; url=${page.url()}; storage=${JSON.stringify(await page.evaluate(() => ({ localStorageKeys: Object.keys(localStorage), cookieNames: document.cookie.split(";").map((x) => x.trim().split("=")[0]).filter(Boolean) })))}; body=${redact(body).slice(0, 900)}`);
  }
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
    const userA = await obtainSession(supabase, "User A", "sprint15-uat-normal@example.com", "eaf666ed-0f3c-4ada-b10c-275cc9596505", "UAT_USER_A_EMAIL", "UAT_USER_A_PASSWORD");
    const userB = await obtainSession(supabase, "User B", "sprint15-uat-elevated@example.com", "c460f3be-c7d1-4b14-9b85-bdeb773dc312", "UAT_USER_B_EMAIL", "UAT_USER_B_PASSWORD");
    checks.push({ id: "password_auth_user_a", status: "pass", userId: userA.user.id });
    checks.push({ id: "password_auth_user_b", status: "pass", userId: userB.user.id });

    async function makeContext(session, viewport) {
      const ctx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: headers, viewport });
      const storage = sessionStorage(session);
      await ctx.addInitScript(({ key, value, cookies }) => {
        localStorage.setItem(key, value);
        for (const cookie of cookies) document.cookie = `${cookie.name}=${cookie.value}; path=/; max-age=31536000; secure; samesite=lax`;
      }, storage);
      const bootstrap = await ctx.newPage();
      await bootstrap.goto("/", { waitUntil: "domcontentloaded" });
      await ctx.addCookies(storage.cookies.map((cookie) => ({ ...cookie, url: BASE_URL, secure: true, sameSite: "Lax" })));
      await bootstrap.reload({ waitUntil: "domcontentloaded" });
      const seededCookies = await ctx.cookies(BASE_URL);
      assert(seededCookies.some((cookie) => cookie.name === storage.key || cookie.name.startsWith(`${storage.key}.`)), `Supabase SSR auth cookie missing; prepared=${storage.cookies.map((cookie) => cookie.name).join(",")}; context=${seededCookies.map((cookie) => cookie.name).join(",")}`);
      await bootstrap.close();
      return ctx;
    }
    const ctxA = await makeContext(userA, { width: 1440, height: 980 });
    const ctxB = await makeContext(userB, { width: 1440, height: 980 });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    for (const page of [pageA, pageB]) page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(redact(message.text())); });

    await visit(pageA, "/dashboard", "Dashboard", checks);
    await visit(pageB, "/dashboard", "Dashboard", checks);
    await visit(pageA, "/onboarding", "Set up your investment profile", checks);
    const settingsContext = await makeContext(userA, { width: 1440, height: 980 });
    const settingsPage = await settingsContext.newPage();
    await visit(settingsPage, "/settings", "Settings", checks);
    await settingsContext.close();
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
    await visit(pageA, "/research/copilot/70073", "Research Copilot", checks);
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

    const feedbackClientSubmissionId = randomUUID();
    const feedback = await responseStatus(pageA, "/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "general", message: `Sprint 17 Preview UAT ${randomUUID()}`, pagePath: "/research", satisfactionScore: 4, contactPermission: false, clientSubmissionId: feedbackClientSubmissionId }) });
    assert(feedback.status === 200, `Preview feedback submission failed; status=${feedback.status}; body=${redact(feedback.body)}`);
    checks.push({ id: "feedback_submission", status: "pass" });
    const feedbackInvalid = await responseStatus(pageA, "/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "invalid", message: "" }) });
    assert(feedbackInvalid.status === 400, "Invalid feedback was not rejected");
    checks.push({ id: "feedback_validation", status: "pass" });
    const feedbackCleanup = await supabase.from("user_feedback").delete().eq("user_id", userA.user.id).eq("client_submission_id", feedbackClientSubmissionId);
    assert(!feedbackCleanup.error, "Preview feedback cleanup failed");
    checks.push({ id: "preview_feedback_cleanup", status: "pass" });

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
























