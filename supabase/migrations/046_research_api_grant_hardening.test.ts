import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("046_research_api_grant_hardening.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "046_research_api_grant_hardening.sql"), "utf8");
  const lower = sql.toLowerCase();

  it("does not drop objects or write data", () => {
    expect(lower).not.toMatch(/drop\s+(table|view|function|schema)/);
    expect(lower).not.toMatch(/truncate/);
    expect(lower).not.toMatch(/delete from/);
    expect(lower).not.toMatch(/insert into/);
    expect(lower).not.toMatch(/update\s+public\./);
  });

  it("normalizes every curated research view to select-only grants", () => {
    const views = [
      "v_market_geography_search_v1",
      "v_suburb_market_snapshot_v1",
      "v_postcode_market_snapshot_v1",
      "v_suburb_demographic_profile_v1",
      "v_postcode_demographic_profile_v1",
      "v_dataset_freshness_v1",
      "v_refresh_run_history_v1",
      "v_metric_assumptions_v1",
      "v_quality_summary_v1",
      "v_evidence_catalogue_v1",
    ];
    for (const view of views) {
      expect(lower).toContain(`revoke all privileges on table public.${view} from anon, authenticated`);
      expect(lower).toContain(`grant select on table public.${view} to anon, authenticated`);
    }
    expect(lower).not.toMatch(/grant\s+(insert|update|delete|truncate|references|trigger)/);
  });

  it("revokes PUBLIC function execution before explicit anon/authenticated grants", () => {
    expect(lower).toContain("revoke all privileges on function public.get_market_snapshot_v2(text) from public, anon, authenticated");
    expect(lower).toContain("grant execute on function public.get_market_snapshot_v2(text) to anon, authenticated");
    expect(lower).toContain("revoke all on schema core, mart, meta from anon, authenticated");
  });

  it("only revokes on schema staging if it exists, so this migration applies unmodified whether or not the full 003-036 staging schema is present (e.g. Production's minimum-contract bootstrap never creates it)", () => {
    expect(lower).toMatch(/if exists \(select 1 from pg_namespace where nspname = 'staging'\)/);
    expect(lower).toContain("revoke all on schema staging from anon, authenticated");
  });
});