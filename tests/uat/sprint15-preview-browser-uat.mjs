import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const EXACT_ALLOWED_BASE_URLS = new Set([
  "https://property-ai-sprint15-uat-zeebusiness93-2304s-projects.vercel.app",
  "https://property-cmtjd1ayc-zeebusiness93-2304s-projects.vercel.app",
]);

const PRODUCTION_DENYLIST = [
  "app.propellect.com.au",
  "propellect.com.au",
  "localhost",
  "127.0.0.1",
];

const OUT_DIR = path.join(process.cwd(), "uat-artifacts", "sprint15-browser");
let partialEvidence = null;
const WAREHOUSE_VALIDATION_SUPABASE_URL = "https://lzonauinzatmtytyoems.supabase.co";
const PRODUCTION_SUPABASE_REF = "oshquaxsloolqucwvigc";
const UAT_USERS = {
  a: {
    label: "User A",
    email: "sprint15-uat-normal@example.com",
    expectedTier: "free",
    expectedId: "eaf666ed-0f3c-4ada-b10c-275cc9596505",
  },
  b: {
    label: "User B",
    email: "sprint15-uat-elevated@example.com",
    expectedTier: "investor_pro",
    expectedId: "c460f3be-c7d1-4b14-9b85-bdeb773dc312",
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeBaseURL() {
  const raw = (process.env.PREVIEW_UAT_BASE_URL || "https://property-ai-sprint15-uat-zeebusiness93-2304s-projects.vercel.app").trim();
  assert(raw, "PREVIEW_UAT_BASE_URL is empty");
  const url = new URL(raw);
  const normalized = `${url.protocol}//${url.host}`;
  assert(url.protocol === "https:", "Preview UAT must use https");
  assert(EXACT_ALLOWED_BASE_URLS.has(normalized), `Unsafe Preview UAT base URL: ${normalized}`);
  assert(!PRODUCTION_DENYLIST.some((needle) => normalized.includes(needle)), "Refusing Production or local URL");
  return normalized;
}

function bypassHeaders() {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  assert(secret && secret.trim() === secret, "VERCEL_AUTOMATION_BYPASS_SECRET is missing or malformed");
  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  };
}

function requireWarehouseValidationAdminKey(supabaseUrl) {
  assert(supabaseUrl === WAREHOUSE_VALIDATION_SUPABASE_URL, "Refusing admin Auth mutation outside warehouse-validation");
  assert(!supabaseUrl.includes(PRODUCTION_SUPABASE_REF), "Refusing admin Auth mutation against production Supabase ref");
  const serviceRoleKey = process.env.WAREHOUSE_VALIDATION_SUPABASE_SERVICE_ROLE_KEY;
  assert(serviceRoleKey && serviceRoleKey.trim() === serviceRoleKey, "WAREHOUSE_VALIDATION_SUPABASE_SERVICE_ROLE_KEY is missing or malformed");
  return serviceRoleKey;
}

function temporaryPassword() {
  return `S15Uat!${randomUUID()}${randomUUID().slice(0, 16)}`;
}

function stringToBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createCookieChunks(key, value, chunkSize = 3180) {
  const encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= chunkSize) return [{ name: key, value }];

  const chunks = [];
  let remaining = encodedValue;
  while (remaining.length > 0) {
    let encodedHead = remaining.slice(0, chunkSize);
    const lastEscapePos = encodedHead.lastIndexOf("%");
    if (lastEscapePos > chunkSize - 3) encodedHead = encodedHead.slice(0, lastEscapePos);
    let valueHead = "";
    while (encodedHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedHead);
        break;
      } catch (error) {
        if (error instanceof URIError && encodedHead.at(-3) === "%" && encodedHead.length > 3) {
          encodedHead = encodedHead.slice(0, encodedHead.length - 3);
        } else {
          throw error;
        }
      }
    }
    chunks.push(valueHead);
    remaining = remaining.slice(encodedHead.length);
  }
  return chunks.map((chunk, i) => ({ name: `${key}.${i}`, value: chunk }));
}

function redactHeaders(headers) {
  const redacted = { ...headers };
  for (const key of Object.keys(redacted)) {
    if (/authorization|cookie|vercel-protection-bypass|apikey/i.test(key)) {
      redacted[key] = "[REDACTED]";
    }
  }
  return redacted;
}

function redactText(text) {
  return String(text || "")
    .replace(/sprint15-uat-[a-z]+@example\.com/gi, "[UAT_EMAIL]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[JWT]");
}

function scriptsFrom(html) {
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

async function extractPublicSupabaseConfig(baseURL, headers) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: headers,
    viewport: { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  const homeResponse = await page.goto("/", { waitUntil: "domcontentloaded" });
  assert(homeResponse?.status() === 200, "Preview home did not load through bypass");
  const homeBody = await page.content();
  const chunks = [];
  for (const src of scriptsFrom(homeBody)) {
    const chunk = await page.evaluate(async (scriptSrc) => {
      try {
        const response = await fetch(scriptSrc, { credentials: "include" });
        if (!response.ok) return null;
        return response.text();
      } catch {
        return null;
      }
    }, src);
    if (chunk) chunks.push(chunk);
  }
  await context.close();
  await browser.close();

  const all = [homeBody, ...chunks].join("\n");
  const supabaseUrl = all.match(/https:\/\/lzonauinzatmtytyoems\.supabase\.co/)?.[0];
  const anonKey = [...new Set(all.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g) || [])].find((token) => token.length > 100);
  assert(supabaseUrl === "https://lzonauinzatmtytyoems.supabase.co", "Preview public Supabase URL is not warehouse-validation");
  assert(anonKey, "Could not locate public anon key in Preview bundle");
  assert(!all.includes("oshquaxsloolqucwvigc"), "Production Supabase ref leaked into Preview bundle");
  assert(!all.includes(process.env.VERCEL_AUTOMATION_BYPASS_SECRET), "Bypass secret leaked into Preview bundle");
  assert(!/service_role|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|POSTGRES_PASSWORD|ANTHROPIC_API_KEY/.test(all), "Privileged secret marker leaked into Preview bundle");
  return { supabaseUrl, anonKey, scannedChunks: chunks.length };
}

async function signInApprovedUser(supabaseUrl, anonKey, email, password, label) {
  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`${label} password sign-in failed after admin repair: ${signedIn.error.message}`);
  const session = signedIn.data.session;
  assert(session?.access_token && session?.refresh_token && session.user?.id, `No real Supabase session for ${label}`);
  await supabase.auth.signOut();
  return session;
}

async function prepareAdminManagedUatUsers(supabaseUrl, anonKey) {
  const serviceRoleKey = requireWarehouseValidationAdminKey(supabaseUrl);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const prepared = {};

  for (const [key, user] of Object.entries(UAT_USERS)) {
    const password = temporaryPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(user.expectedId, {
      password,
      email_confirm: true,
    });
    assert(
      !updateError,
      `${user.label} admin password repair failed: ${updateError?.name || "unknown"} ${updateError?.status || ""} ${updateError?.message || ""}`.trim(),
    );

    const session = await signInApprovedUser(supabaseUrl, anonKey, user.email, password, user.label);
    assert(session.user.id === user.expectedId, `${user.label} signed in as unexpected user`);
    prepared[key] = { session, source: "admin_repaired_existing_uat_user", expectedTier: user.expectedTier };
  }

  return prepared;
}

function storageStateFor(supabaseUrl, session) {
  const ref = new URL(supabaseUrl).host.split(".")[0];
  const key = `sb-${ref}-auth-token`;
  const value = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user,
  });
  return {
    key,
    value,
    cookies: createCookieChunks(key, `base64-${stringToBase64Url(value)}`),
  };
}

async function newAuthedPage(browser, baseURL, headers, supabaseStorage) {
  const host = new URL(baseURL).hostname;
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: headers,
    viewport: { width: 1440, height: 980 },
    recordVideo: undefined,
  });
  await context.addInitScript(({ key, value, cookies }) => {
    window.localStorage.setItem(key, value);
    for (const cookie of cookies) {
      document.cookie = `${cookie.name}=${cookie.value}; path=/; max-age=31536000; secure; samesite=lax`;
    }
  }, supabaseStorage);
  await context.addCookies(
    supabaseStorage.cookies.map((cookie) => ({
      ...cookie,
      domain: host,
      path: "/",
      secure: true,
      sameSite: "Lax",
    })),
  );
  const page = await context.newPage();
  page.on("request", (request) => {
    redactHeaders(request.headers());
  });
  return { context, page };
}

async function rest(page, supabaseUrl, anonKey, token, method, table, query, body) {
  return page.evaluate(
    async ({ supabaseUrl, anonKey, token, method, table, query, body }) => {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}${query || ""}`, {
        method,
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, json };
    },
    { supabaseUrl, anonKey, token, method, table, query, body }
  );
}

async function cleanupUserData(page, supabaseUrl, anonKey, session, labelPrefix) {
  const token = session.access_token;
  const userId = session.user.id;
  const deletes = [
    ["portfolio_properties", `?user_id=eq.${userId}`],
    ["scenario_lab_cases", `?user_id=eq.${userId}`],
    ["watchlist_items", `?user_id=eq.${userId}`],
    ["property_comparisons", `?user_id=eq.${userId}`],
    ["property_reports", `?user_id=eq.${userId}`],
  ];

  for (const [table, query] of deletes) {
    const result = await rest(page, supabaseUrl, anonKey, token, "DELETE", table, query, null);
    assert([200, 204, 404].includes(result.status), `${labelPrefix} cleanup failed for ${table}`);
  }
}

async function insertRows(page, supabaseUrl, anonKey, session, labelPrefix, options = {}) {
  const { expectScenarioLimit = true } = options;
  const token = session.access_token;
  const userId = session.user.id;
  const suffix = randomUUID().slice(0, 8);
  const report = await rest(page, supabaseUrl, anonKey, token, "POST", "property_reports", "", {
    user_id: userId,
    property_name: `${labelPrefix} report ${suffix}`,
    suburb: "Darwin City",
    state: "NT",
    property_type: "residential",
    purchase_price: 650000,
    weekly_rent: 620,
    score: 72,
    status_colour: "strong",
    inputs_json: { suburb: "Darwin City", state: "NT", purchasePrice: 650000, weeklyRent: 620 },
    results_json: { score: 72, status: "strong" },
  });
  assert(report.status === 201, `${labelPrefix} report insert failed`);
  const reportId = report.json[0].id;

  const comparison = await rest(page, supabaseUrl, anonKey, token, "POST", "property_comparisons", "", {
    user_id: userId,
    label: `${labelPrefix} comparison ${suffix}`,
    comparison_json: { a: "Darwin City", b: "Charles Darwin", selected: suffix },
  });
  assert(comparison.status === 201, `${labelPrefix} comparison insert failed`);

  const watchlist = await rest(page, supabaseUrl, anonKey, token, "POST", "watchlist_items", "", {
    user_id: userId,
    type: "suburb",
    suburb: "Darwin City",
    state: "NT",
    notes: `${labelPrefix} watchlist ${suffix}`,
    geography_id: "SAL_70073_ASGS3_2021",
    geography_code: "70073",
    geography_type: "SAL",
    tags: ["uat"],
  });
  assert(watchlist.status === 201, `${labelPrefix} watchlist insert failed`);

  const portfolio = await rest(page, supabaseUrl, anonKey, token, "POST", "portfolio_properties", "", {
    user_id: userId,
    property_report_id: reportId,
    label: `${labelPrefix} portfolio ${suffix}`,
    current_value: 700000,
    loan_balance: 480000,
    weekly_rent: 620,
    annual_expenses: 8000,
    ownership_percentage: 100,
  });
  assert(portfolio.status === 201, `${labelPrefix} portfolio insert failed`);

  const scenarioCount = expectScenarioLimit ? 10 : 11;
  const scenarioIds = [];
  for (let i = 0; i < scenarioCount; i += 1) {
    const scenario = await rest(page, supabaseUrl, anonKey, token, "POST", "scenario_lab_cases", "", {
      user_id: userId,
      geography_id: "SAL_70073_ASGS3_2021",
      geography_code: "70073",
      geography_label: "Darwin City",
      label: `${labelPrefix} scenario ${i + 1} ${suffix}`,
      deposit_percent: 20,
      loan_term_years: 30,
      interest_rate_percent: 6.5,
      vacancy_percent: 2,
      annual_expenses: 8000,
      scenario_json: { index: i + 1, suffix },
    });
    assert(scenario.status === 201, `${labelPrefix} scenario ${i + 1} insert failed`);
    scenarioIds.push(scenario.json[0].id);
  }
  if (expectScenarioLimit) {
    const limit = await rest(page, supabaseUrl, anonKey, token, "POST", "scenario_lab_cases", "", {
      user_id: userId,
      geography_id: "SAL_70073_ASGS3_2021",
      geography_code: "70073",
      geography_label: "Darwin City",
      label: `${labelPrefix} over-limit ${suffix}`,
      deposit_percent: 20,
      loan_term_years: 30,
      interest_rate_percent: 6.5,
      scenario_json: { overLimit: true },
    });
    assert(limit.status >= 400, `${labelPrefix} free-user scenario limit was not enforced`);
  }

  return {
    reportId,
    comparisonId: comparison.json[0].id,
    watchlistId: watchlist.json[0].id,
    portfolioId: portfolio.json[0].id,
    scenarioIds,
    labels: {
      report: report.json[0].property_name,
      comparison: comparison.json[0].label,
      watchlist: watchlist.json[0].notes,
      portfolio: portfolio.json[0].label,
    },
  };
}

async function expectText(page, text, message) {
  await page.waitForLoadState("domcontentloaded");
  const deadline = Date.now() + 15000;
  let body = "";
  while (Date.now() < deadline) {
    body = await page.locator("body").innerText();
    if (body.includes(text)) return;
    await page.waitForTimeout(250);
  }
  assert(body.includes(text), `${message}; url=${page.url()}; body=${redactText(body).slice(0, 800)}`);
}

async function expectNoText(page, text, message) {
  await page.waitForLoadState("domcontentloaded");
  const body = await page.locator("body").innerText();
  assert(!body.includes(text), message);
}

async function run() {
  const baseURL = safeBaseURL();
  const headers = bypassHeaders();
  await mkdir(OUT_DIR, { recursive: true });

  const { supabaseUrl, anonKey, scannedChunks } = await extractPublicSupabaseConfig(baseURL, headers);
  const users = await prepareAdminManagedUatUsers(supabaseUrl, anonKey);
  const userA = users.a;
  const userB = users.b;

  const browser = await chromium.launch({ headless: true });
  const evidence = {
    baseURL,
    deploymentExpected: "dpl_4oRRX1QyDWFLFU4MxSRKdrkPFqZu",
    supabaseBranch: "warehouse-validation",
    supabaseRef: "lzonauinzatmtytyoems",
    authMethod: "admin_repaired_existing_uat_users_password_sign_in",
    users: [
      { label: "User A", expectedTier: userA.expectedTier, userId: userA.session.user.id },
      { label: "User B", expectedTier: userB.expectedTier, userId: userB.session.user.id },
    ],
    scannedChunks,
    checks: [],
  };
  partialEvidence = evidence;

  try {
    const aStorage = storageStateFor(supabaseUrl, userA.session);
    const bStorage = storageStateFor(supabaseUrl, userB.session);
    const userAPage = await newAuthedPage(browser, baseURL, headers, aStorage);
    const userBPage = await newAuthedPage(browser, baseURL, headers, bStorage);

    await userAPage.page.goto("/dashboard");
    const aSessionVisible = await userAPage.page.evaluate((key) => ({
      hasLocalStorage: Boolean(window.localStorage.getItem(key)),
      cookieNames: document.cookie
        .split(";")
        .map((item) => item.trim().split("=")[0])
        .filter((name) => name.startsWith(key)),
    }), aStorage.key);
    evidence.checks.push({ id: "user_a_seeded_session_visible", status: "info", detail: aSessionVisible });
    await expectText(userAPage.page, "Dashboard", "User A dashboard did not load");
    evidence.checks.push({ id: "auth_user_a_dashboard", status: "pass" });

    await userBPage.page.goto("/dashboard");
    await expectText(userBPage.page, "Dashboard", "User B dashboard did not load");
    evidence.checks.push({ id: "auth_user_b_dashboard", status: "pass" });

    await cleanupUserData(userAPage.page, supabaseUrl, anonKey, userA.session, "User A");
    await cleanupUserData(userBPage.page, supabaseUrl, anonKey, userB.session, "User B");
    evidence.checks.push({ id: "branch_uat_user_data_cleanup", status: "pass" });

    const aRows = await insertRows(userAPage.page, supabaseUrl, anonKey, userA.session, "User A", { expectScenarioLimit: true });
    const bRows = await insertRows(userBPage.page, supabaseUrl, anonKey, userB.session, "User B", { expectScenarioLimit: false });
    evidence.checks.push({ id: "browser_direct_rls_inserts", status: "pass" });
    evidence.checks.push({ id: "free_user_scenario_limit", status: "pass" });
    evidence.checks.push({ id: "elevated_user_scenario_allowance", status: "pass" });

    await userAPage.page.goto("/dashboard");
    await expectText(userAPage.page, aRows.labels.report, "User A dashboard missing own report");
    await expectNoText(userAPage.page, bRows.labels.report, "User A dashboard leaked User B report");
    await expectNoText(userAPage.page, bRows.labels.comparison, "User A dashboard leaked User B comparison");
    await expectNoText(userAPage.page, bRows.labels.watchlist, "User A dashboard leaked User B watchlist");
    await expectNoText(userAPage.page, bRows.labels.portfolio, "User A dashboard leaked User B portfolio");
    evidence.checks.push({ id: "dashboard_cross_user_isolation", status: "pass" });

    await userBPage.page.goto(`/reports/${aRows.reportId}`);
    await expectNoText(userBPage.page, aRows.labels.report, "User B could view User A report page");
    evidence.checks.push({ id: "report_direct_url_isolation", status: "pass" });

    const bReadAReport = await rest(userBPage.page, supabaseUrl, anonKey, userB.session.access_token, "GET", "property_reports", `?id=eq.${aRows.reportId}`, null);
    assert(bReadAReport.status === 200 && Array.isArray(bReadAReport.json) && bReadAReport.json.length === 0, "User B REST read exposed User A report");
    const bPatchAReport = await rest(userBPage.page, supabaseUrl, anonKey, userB.session.access_token, "PATCH", "property_reports", `?id=eq.${aRows.reportId}`, { property_name: "attempted overwrite" });
    assert([200, 204].includes(bPatchAReport.status) && (!Array.isArray(bPatchAReport.json) || bPatchAReport.json.length === 0), "User B REST patch altered User A report");
    evidence.checks.push({ id: "direct_api_cross_user_read_write_isolation", status: "pass" });

    const selfElevate = await rest(userAPage.page, supabaseUrl, anonKey, userA.session.access_token, "POST", "user_entitlements", "", {
      user_id: userA.session.user.id,
      tier: "professional",
      source: "uat_attack",
    });
    assert(selfElevate.status >= 400, "Self-elevation insert unexpectedly succeeded");
    evidence.checks.push({ id: "self_elevation_rejected", status: "pass" });

    const journeys = [
      ["/", "Investor-grade tools"],
      ["/analyse-property", "Analyse a Property"],
      ["/compare-properties", "Compare"],
      ["/watchlist", "watchlist"],
      ["/portfolio", "Portfolio"],
      ["/research", "Suburb Intelligence"],
      ["/research/explore", "Explore"],
      ["/research/suburb/70073", "Suburb research snapshot"],
      ["/research/postcode/2000", "Postcode research snapshot"],
      ["/research/map", "Map"],
      ["/research/scenario/70073", "Scenario Lab"],
      ["/research/sources", "Evidence"],
      ["/research/data-status", "Data operations console"],
      ["/definitely-not-a-real-route", "404"],
    ];
    for (const [route, text] of journeys) {
      await userAPage.page.goto(route);
      await expectText(userAPage.page, text, `Journey ${route} missing expected text`);
    }
    evidence.checks.push({ id: "product_journeys_desktop", status: "pass" });

    await userAPage.page.setViewportSize({ width: 390, height: 844 });
    await userAPage.page.goto("/research");
    await expectText(userAPage.page, "Suburb Intelligence", "Mobile research page did not render");
    await userAPage.page.keyboard.press("Tab");
    const focusedVisible = await userAPage.page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    assert(focusedVisible, "Keyboard focus is not visible on first tab stop");
    evidence.checks.push({ id: "mobile_and_keyboard_smoke", status: "pass" });

    const publicApis = [
      "/api/v1",
      "/api/v1/search?q=darwin",
      "/api/v1/compare?ids=0800,0810",
      "/api/v1/snapshot/SAL_70073_ASGS3_2021",
      "/api/v1/export/SAL_70073_ASGS3_2021?format=json",
      "/api/v1/export/SAL_70073_ASGS3_2021?format=csv",
    ];
    for (const route of publicApis) {
      const status = await userAPage.page.evaluate(async (route) => {
        const response = await fetch(route);
        return response.status;
      }, route);
      assert(status === 200, `Public API route failed: ${route}`);
    }
    evidence.checks.push({ id: "public_api_search_compare_export", status: "pass" });

    await userAPage.page.goto("/admin");
    assert((await userAPage.page.locator("body").innerText()).includes("404"), "Admin route did not fail safely");
    await userAPage.page.goto("/research/copilot/70073");
    assert((await userAPage.page.locator("body").innerText()).includes("404"), "Copilot route did not fail safely");
    evidence.checks.push({ id: "disabled_admin_copilot", status: "pass" });

    await userAPage.page.goto("/dashboard");
    await userAPage.page.getByRole("button", { name: "Sign out" }).first().click();
    await userAPage.page.waitForTimeout(1200);
    await expectText(userAPage.page, "Sign in to view your dashboard", "Sign-out did not clear authenticated dashboard");
    evidence.checks.push({ id: "sign_out_and_unauthenticated_state", status: "pass" });

    await userBPage.context.close();
    await userAPage.context.close();
  } finally {
    await browser.close();
  }

  await writeFile(path.join(OUT_DIR, "sprint15-browser-uat-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status: "pass", checks: evidence.checks.length, artifact: "uat-artifacts/sprint15-browser/sprint15-browser-uat-evidence.json" }));
}

run().catch(async (error) => {
  await mkdir(OUT_DIR, { recursive: true });
  const cause = error?.cause
    ? {
        name: error.cause.name,
        code: error.cause.code,
        message: error.cause.message,
      }
    : undefined;
  await writeFile(
    path.join(OUT_DIR, "sprint15-browser-uat-failure.json"),
    JSON.stringify({ status: "fail", message: error.message, cause, partialEvidence }, null, 2),
  );
  console.error(`Sprint 15 browser UAT failed: ${error.message}`);
  process.exit(1);
});
