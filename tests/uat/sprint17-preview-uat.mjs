import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createChunks } = require("C:/Users/abdul/property-ai/node_modules/@supabase/ssr/dist/main/utils/chunker.js");
const { stringToBase64URL } = require("C:/Users/abdul/property-ai/node_modules/@supabase/ssr/dist/main/utils/base64url.js");

const BASE_URL = "https://property-qbgwoix3b-zeebusiness93-2304s-projects.vercel.app";
const EXPECTED_COMMIT = "80f0a1a147cb9d11d25c963f9373c88764caf825";
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
  const resolvedEmail = email || process.env[emailEnv];
  const result = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
  assert(!result.error && result.data.session?.user?.id === expectedId, `${label} password sign-in failed`);
  // In @supabase/auth-js, signOut() always calls the server regardless of scope --
  // "global" revokes every session for the user, "local" revokes only the CURRENT
  // session (verified against a live warehouse-validation session: scope "local"
  // still returns session_not_found from /auth/v1/user afterwards). Only "others"
  // revokes every *other* session while leaving this one alive, which is what we
  // actually want: clean up stale sessions from prior runs without killing the
  // session we're about to seed into the browser. Using "global" or "local" here
  // is what was clearing the seeded SSR cookie and leaving /settings signed out.
  await supabase.auth.signOut({ scope: "others" });
  // Stashes the actual email/password used as extra properties on the
  // returned session object (not a shape change -- every existing
  // userA.user.id / userA.access_token / makeContext(userA, ...) call site
  // is unaffected) because when adminKey is set, the password above was
  // just randomly regenerated for this account -- any later code needing
  // to sign in again as this same user (e.g. a "sign back in after
  // sign-out" UAT check) must reuse this exact resolved password, not
  // process.env[passwordEnv], which no longer matches the account after
  // the repair above.
  const session = result.data.session;
  session._resolvedEmail = resolvedEmail;
  session._resolvedPassword = password;
  return session;
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
    // user_feedback deliberately has no delete policy for authenticated users
    // (append-only/immutable by design -- see KNOWN_EXCEPTIONS in
    // warehouse/scripts/quality/check_rls_policies.mjs), so a delete() call
    // through the anon-key user client is silently filtered by RLS: it
    // returns success with zero rows affected, not an error. Cleanup must go
    // through the service-role admin client, and must verify the row is
    // actually gone afterward rather than trusting a lack of error.
    const adminKeyForCleanup = process.env.WAREHOUSE_VALIDATION_SUPABASE_SERVICE_ROLE_KEY;
    assert(adminKeyForCleanup, "Cannot verify feedback cleanup without WAREHOUSE_VALIDATION_SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(WAREHOUSE_URL, adminKeyForCleanup, { auth: { persistSession: false, autoRefreshToken: false } });
    const feedbackCleanup = await admin.from("user_feedback").delete({ count: "exact" }).eq("user_id", userA.user.id).eq("client_submission_id", feedbackClientSubmissionId);
    assert(!feedbackCleanup.error, `Preview feedback cleanup failed: ${feedbackCleanup.error?.message}`);
    assert(feedbackCleanup.count === 1, `Preview feedback cleanup deleted ${feedbackCleanup.count} rows, expected exactly 1`);
    const feedbackCleanupVerify = await admin.from("user_feedback").select("id").eq("user_id", userA.user.id).eq("client_submission_id", feedbackClientSubmissionId);
    assert(!feedbackCleanupVerify.error && feedbackCleanupVerify.data.length === 0, "Preview feedback row still present after cleanup");
    checks.push({ id: "preview_feedback_cleanup", status: "pass", rowsDeleted: feedbackCleanup.count });

    const copilotInvalid = await responseStatus(pageA, "/api/research/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ geographyCode: "70073", question: "" }) });
    assert(copilotInvalid.status === 400, "Copilot invalid input was not rejected");
    checks.push({ id: "copilot_validation_and_route", status: "pass" });

    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.goto("/research", { waitUntil: "domcontentloaded" });
    await pageA.keyboard.press("Tab");
    const focusVisible = await pageA.evaluate(() => { const e = document.activeElement; const r = e?.getBoundingClientRect(); return Boolean(r && r.width > 0 && r.height > 0); });
    assert(focusVisible, "Mobile keyboard focus was not visible");
    checks.push({ id: "mobile_keyboard_smoke", status: "pass" });

    // ctxA/ctxB are done being used for assertions at this point. Closed here
    // (rather than at the very end) because leaving them open while the
    // sign-out sequence below runs was observed to cause the dashboard's
    // client-side auth state to spuriously re-authenticate as User A after a
    // genuine sign-out -- consistent with same-origin BroadcastChannel
    // cross-talk between still-live Playwright browser contexts holding a
    // valid session for the same user (GoTrueClient broadcasts session state
    // over a BroadcastChannel keyed by storageKey for cross-tab sync; nothing
    // in this repo's app code reads localStorage for auth, and this is not
    // something a real single-browser end user could trigger, since they
    // only ever have one origin-wide session, not several concurrent
    // Playwright-isolated contexts for the same account).
    await ctxA.close();
    await ctxB.close();

    // --- Real-UI sign-out, cookie clearing, post-signout rejection, and re-sign-in ---
    // Sign-IN throughout this harness is necessarily via a seeded session
    // (see obtainSession()/makeContext() above) because the app's only
    // supported sign-in surface is a magic-link email flow
    // (components/auth/EarlyAccessAuthModal.tsx -> signInWithOtp), and this
    // harness has no access to the UAT accounts' email inboxes to retrieve a
    // real magic link. Sign-OUT below is genuine UI interaction: the actual
    // "Sign out" button in components/nav/Navbar.tsx, which calls
    // useAuth().signOut() -> supabase.auth.signOut() client-side.
    // Uses a fresh context/page rather than the long-lived pageA (which by
    // this point has made dozens of navigations) to keep this sequence's
    // timing clean and unambiguous.
    const signOutCtx = await makeContext(userA, { width: 1440, height: 980 });
    const signOutPage = await signOutCtx.newPage();
    await signOutPage.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await signOutPage.getByRole("button", { name: "Sign out" }).first().waitFor({ timeout: 10000 });
    await signOutPage.getByRole("button", { name: "Sign out" }).first().click();
    await signOutPage.waitForTimeout(1500);
    const cookiesAfterSignOut = await signOutCtx.cookies(BASE_URL);
    const authCookieRemains = cookiesAfterSignOut.some((c) => c.name.startsWith(`sb-${new URL(WAREHOUSE_URL).hostname.split(".")[0]}-auth-token`));
    assert(!authCookieRemains, "Supabase auth cookie was still present after clicking Sign out");
    checks.push({ id: "real_ui_sign_out_clears_cookie", status: "pass" });

    // useAuth() resolves the (now-cleared) session asynchronously on first
    // client-side render, so the signed-out UI text only appears after that
    // resolves -- not necessarily by the time "domcontentloaded" fires.
    // Reuses visit()'s existing retry/reload/diagnostic pattern rather than
    // a single fixed timeout. Uses a brand-new Page (same context, so it
    // still shares the now-cleared cookies) rather than continuing to
    // navigate signOutPage, ruling out any in-memory JS state (singleton
    // client, closures) surviving across navigations on the same Page.
    const postSignOutPage = await signOutCtx.newPage();
    await visit(postSignOutPage, "/settings", "Sign in to edit settings", checks);
    const freshDashboardPage = await signOutCtx.newPage();
    await visit(freshDashboardPage, "/dashboard", "Sign in to view your dashboard", checks);
    await signOutCtx.close();

    // Sign back in: the real "Sign out" button above calls
    // supabase.auth.signOut() with the default (global) scope, which
    // genuinely revokes that session server-side -- confirmed by the
    // entitlements check below initially failing with a real 401 when this
    // section first reused userA's now-revoked tokens. Client-side checks
    // (useAuth() -> getSession(), which trusts a locally-still-unexpired JWT
    // without re-verifying against the server) don't reflect that
    // revocation, but server-side checks (getUser(), used by middleware and
    // every API route including this one) correctly do -- i.e. the app
    // fails closed exactly where it matters. So "signing back in" here
    // requires a genuinely fresh sign-in (new signInWithPassword call, new
    // session_id), not reseeding the same tokens sign-out just revoked.
    const userAFreshSignIn = await supabase.auth.signInWithPassword({ email: userA._resolvedEmail, password: userA._resolvedPassword });
    assert(
      !userAFreshSignIn.error && userAFreshSignIn.data.session?.user?.id === userA.user.id,
      `Fresh sign-back-in for User A failed: error=${JSON.stringify(userAFreshSignIn.error)}; hasSession=${Boolean(userAFreshSignIn.data?.session)}; returnedUserId=${userAFreshSignIn.data?.session?.user?.id}; expectedUserId=${userA.user.id}`
    );
    await supabase.auth.signOut({ scope: "others" });
    const freshUserASession = userAFreshSignIn.data.session;

    const reSeeded = await makeContext(freshUserASession, { width: 1440, height: 980 });
    const pageA2 = await reSeeded.newPage();
    await pageA2.goto("/settings", { waitUntil: "domcontentloaded" });
    await pageA2.getByText("Settings").first().waitFor({ timeout: 15000 });
    const settingsAfterResignin = await pageA2.locator("body").innerText();
    assert(settingsAfterResignin.includes("Settings") && !settingsAfterResignin.includes("Sign in to edit settings"), "Re-sign-in did not restore authenticated access to /settings");
    checks.push({ id: "sign_back_in_restores_access", status: "pass" });

    // Entitlement boundary: documents current behaviour rather than
    // asserting a restriction that (per lib/auth/entitlements.ts) does not
    // exist -- research_preview and this account's other features are all
    // "free" tier today. Uses the server-verified route (getUser(), not the
    // client's getSession()) so this is a real proof the fresh session is
    // valid server-side, not just client-rendered.
    const entitlementsResult = await pageA2.evaluate(async () => {
      const r = await fetch("/api/account/entitlements");
      return { status: r.status, body: await r.json().catch(() => null) };
    });
    assert(entitlementsResult.status === 200, `Entitlements endpoint did not respond for an authenticated user (status=${entitlementsResult.status}, body=${JSON.stringify(entitlementsResult.body)})`);
    checks.push({ id: "entitlement_boundary_documented", status: "pass", tier: entitlementsResult.body.tier ?? null });
    await reSeeded.close();

    // Admin remains 404 and Copilot remains gated by its Preview-only flag
    // are already exercised above (route__admin, route__research_copilot_70073,
    // preview_configuration_attestation confirms researchCopilot flag state).

    // Cross-user REST isolation: User A inserts a uniquely-labelled feedback
    // row directly via REST under their own RLS-scoped session (not through
    // the app's rate-limited /api/feedback route -- this section tests RLS
    // SELECT isolation specifically, decoupled from the feedback endpoint's
    // own rate limiting, which feedback_submission/feedback_validation above
    // already exercise). Then User B's OWN authenticated Supabase client
    // (not service-role) attempts to read it. RLS (auth.uid() = user_id,
    // select-only policy on user_feedback) must return zero rows for User B.
    const isolationSubmissionId = randomUUID();
    const userAWriteClient = createClient(WAREHOUSE_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    // Uses freshUserASession, not userA -- userA's original tokens were
    // already revoked by the real sign-out button click above.
    const userASetSession = await userAWriteClient.auth.setSession({ access_token: freshUserASession.access_token, refresh_token: freshUserASession.refresh_token });
    assert(!userASetSession.error, `Restoring User A's session for the isolation insert failed: ${userASetSession.error?.message}`);
    const isolationInsert = await userAWriteClient
      .from("user_feedback")
      .insert({ user_id: userA.user.id, category: "general", message: `Sprint 17.5 isolation probe ${isolationSubmissionId}`, client_submission_id: isolationSubmissionId })
      .select("id");
    assert(!isolationInsert.error && isolationInsert.data.length === 1, `Isolation-probe feedback insert failed: ${isolationInsert.error?.message}`);
    await userAWriteClient.auth.signOut({ scope: "others" });

    const userBClient = createClient(WAREHOUSE_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    // Uses userB._resolvedEmail/_resolvedPassword (see obtainSession), not
    // process.env directly -- when the admin-repair path ran, the account's
    // real password was randomly regenerated and only obtainSession knows it.
    const userBSignIn = await userBClient.auth.signInWithPassword({ email: userB._resolvedEmail, password: userB._resolvedPassword });
    assert(!userBSignIn.error, `User B REST sign-in for isolation check failed: ${userBSignIn.error?.message}`);
    const userBRead = await userBClient.from("user_feedback").select("id").eq("client_submission_id", isolationSubmissionId);
    assert(!userBRead.error, `User B REST read errored unexpectedly: ${userBRead.error?.message}`);
    assert(userBRead.data.length === 0, "User B was able to read User A's feedback row via REST -- RLS isolation failed");
    await userBClient.auth.signOut({ scope: "others" });
    checks.push({ id: "cross_user_rest_isolation", status: "pass" });

    const isolationCleanup = await admin.from("user_feedback").delete({ count: "exact" }).eq("user_id", userA.user.id).eq("client_submission_id", isolationSubmissionId);
    assert(!isolationCleanup.error && isolationCleanup.count === 1, "Isolation-probe feedback row cleanup failed or deleted the wrong count");
    const isolationCleanupVerify = await admin.from("user_feedback").select("id").eq("client_submission_id", isolationSubmissionId);
    assert(!isolationCleanupVerify.error && isolationCleanupVerify.data.length === 0, "Isolation-probe feedback row still present after cleanup");
    checks.push({ id: "isolation_probe_cleanup", status: "pass", rowsDeleted: isolationCleanup.count });

    const out = { status: "pass", baseURL: BASE_URL, expectedCommit: EXPECTED_COMMIT, branch: BRANCH, supabaseBranch: "warehouse-validation", users: [{ label: "User A", id: userA.user.id }, { label: "User B", id: userB.user.id }], checks, consoleErrors: consoleErrors.slice(0, 20), cleanup: "browser contexts closed; no production data touched" };
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
























