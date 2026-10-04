import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  isDataOperationsEnabled,
  isMultiStateResearchEnabled,
  isPublicApiV1Enabled,
  isResearchCopilotEnabled,
  isScenarioLabEnabled,
  isWarehousePreviewEnabled,
} from "@/lib/warehouse/env";

const WAREHOUSE_VALIDATION_REF = "lzonauinzatmtytyoems";
// V7C: the dedicated, data-less Deal Hunter Preview branch (retired/deleted post-UAT).
const DEAL_HUNTER_PREVIEW_REF = "mmqxwwjshnpcqngciqtx";
// V8: the dedicated, data-less SA Founding Beta branch (parent = Production,
// with_data=false, seeded only with labelled synthetic data). A Preview bound to this
// ref is a genuinely isolated environment, same as warehouse-validation. Adding it here
// only WIDENS the isolated set; the Production-ref checks below are unchanged.
const V8_FOUNDING_BETA_REF = "uvuvhftaexxfrfdgthtw";
const ISOLATED_PREVIEW_REFS = new Set([WAREHOUSE_VALIDATION_REF, DEAL_HUNTER_PREVIEW_REF, V8_FOUNDING_BETA_REF]);
const PRODUCTION_SUPABASE_REF = "oshquaxsloolqucwvigc";
const PRODUCTION_HOSTS = new Set(["app.propellect.com.au", "propellect.com.au", "www.propellect.com.au"]);

function supabaseRefFromUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).host;
    const match = host.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function shortFingerprint(value: string | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function isProductionHost(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    return PRODUCTION_HOSTS.has(new URL(raw).host);
  } catch {
    return false;
  }
}

export function GET() {
  const vercelEnv = process.env.VERCEL_ENV ?? "unknown";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const appSupabaseRef = supabaseRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const warehouseSupabaseRef = supabaseRefFromUrl(process.env.WAREHOUSE_SUPABASE_URL);
  const productionLike =
    vercelEnv === "production" ||
    isProductionHost(siteUrl) ||
    appSupabaseRef === PRODUCTION_SUPABASE_REF ||
    warehouseSupabaseRef === PRODUCTION_SUPABASE_REF;

  if (productionLike) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const targetIsPreview = vercelEnv === "preview";
  const appUsesWarehouseValidation = appSupabaseRef === WAREHOUSE_VALIDATION_REF;
  const warehouseUsesWarehouseValidation = warehouseSupabaseRef === WAREHOUSE_VALIDATION_REF;
  // A Preview is correctly configured when it points at ANY isolated branch
  // (warehouse-validation OR the dedicated deal-hunter-preview branch).
  const appUsesIsolatedPreview = appSupabaseRef != null && ISOLATED_PREVIEW_REFS.has(appSupabaseRef);
  const warehouseUsesIsolatedPreview = warehouseSupabaseRef != null && ISOLATED_PREVIEW_REFS.has(warehouseSupabaseRef);
  const configurationOk = targetIsPreview && appUsesIsolatedPreview && warehouseUsesIsolatedPreview;

  return NextResponse.json(
    {
      target: vercelEnv,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
      environmentLabel: "preview",
      supabase: {
        appProjectRef: appSupabaseRef ? `${appSupabaseRef.slice(0, 4)}...${appSupabaseRef.slice(-4)}` : null,
        warehouseProjectRef: warehouseSupabaseRef ? `${warehouseSupabaseRef.slice(0, 4)}...${warehouseSupabaseRef.slice(-4)}` : null,
        appUsesWarehouseValidation,
        warehouseUsesWarehouseValidation,
        appUsesIsolatedPreview,
        warehouseUsesIsolatedPreview,
        productionRefDetected: false,
        anonKeyFingerprint: shortFingerprint(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        warehouseAnonKeyFingerprint: shortFingerprint(process.env.WAREHOUSE_SUPABASE_ANON_KEY),
      },
      featureFlags: {
        warehousePreview: isWarehousePreviewEnabled(),
        multiStateResearch: isMultiStateResearchEnabled(),
        dataOperations: isDataOperationsEnabled(),
        scenarioLab: isScenarioLabEnabled(),
        publicApiV1: isPublicApiV1Enabled(),
        researchCopilot: isResearchCopilotEnabled(),
        adminEmailsConfigured: Boolean(process.env.ADMIN_EMAILS),
        serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      configurationOk,
    },
    { status: configurationOk ? 200 : 409 }
  );
}
