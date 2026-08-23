import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { V3_SOURCES, ACCEPTED, DISPOSITIONS } from "./v3_source_registry.mjs";

describe("V3 source registry", () => {
  it("every source has a valid disposition and a blocker iff not accepted", () => {
    for (const s of V3_SOURCES) {
      expect(DISPOSITIONS, s.id).toContain(s.disposition);
      if (s.disposition !== "accepted_official_reusable") expect(s.blocker, s.id).toBeTruthy();
    }
  });

  it("accepted sources carry licence + commercial-reuse + attribution + a parser version", () => {
    for (const s of ACCEPTED) {
      expect(s.licence, s.id).toBeTruthy();
      expect(s.licence_url, s.id).toMatch(/^https?:/);
      expect(s.commercial_reuse, s.id).toBe(true);
      expect(s.derivative_permitted, s.id).toBe(true);
      expect(s.attribution, s.id).toBeTruthy();
      expect(s.parser_version, s.id).toBeTruthy();
    }
  });

  it("accepted lanes are the SA + VIC CC-BY sources; others recorded with a precise blocker", () => {
    expect(ACCEPTED.map((s) => s.id).sort()).toEqual(["sa_metro_median_house_sales", "sa_private_rental_report", "vic_dffh_moving_annual_rent"]);
    // VIC rent is served via a documented redirect from the official catalogue
    expect(V3_SOURCES.find((s) => s.id === "vic_dffh_moving_annual_rent")?.licence).toMatch(/Creative Commons/);
    // VIC median-house (land.vic) remains 403 — recorded, not circumvented
    expect(V3_SOURCES.find((s) => s.id === "vic_vg_property_sales")?.disposition).toBe("temporarily_unreachable");
    // TAS publishes a monthly XLSX path, but exact resource/licence/schema still fail closed
    expect(V3_SOURCES.find((s) => s.id === "tas_rental_bonds")?.reachability).toBe(200);
    expect(V3_SOURCES.find((s) => s.id === "tas_rental_bonds")?.disposition).toBe("licence_unclear");
    // existing NSW rent pipeline is now catalogued, but licence evidence remains fail-closed
    expect(V3_SOURCES.find((s) => s.id === "nsw_dcj_rent_and_sales_report")?.disposition).toBe("licence_unclear");
    // WA weekly sales is context-only, never accepted as a median-price lane
    expect(V3_SOURCES.find((s) => s.id === "wa_property_sales")?.disposition).toBe("accepted_official_context_only");
    expect(V3_SOURCES.find((s) => s.id === "wa_property_sales")?.blocker).toMatch(/not a suburb median-price series/);
    // the 2.3GB local collection is never promotable
    expect(V3_SOURCES.find((s) => s.id === "local_2p3gb_collection")?.disposition).toBe("provenance_unverified");
  });

  it("keeps the JSON catalogue and executable registry aligned on release-critical fields", () => {
    const jsonSources = JSON.parse(fs.readFileSync(new URL("./v3_source_registry.json", import.meta.url), "utf8"));
    expect(jsonSources.map((source: { id: string }) => source.id)).toEqual(V3_SOURCES.map((source) => source.id));
    const fields = ["jurisdiction", "landing", "resource_url", "licence", "licence_url", "parser_version", "disposition", "blocker", "reachability"];
    for (const source of V3_SOURCES) {
      const jsonSource = jsonSources.find((item: { id: string }) => item.id === source.id);
      expect(jsonSource, source.id).toBeTruthy();
      for (const field of fields) expect(jsonSource[field], `${source.id}.${field}`).toEqual(source[field]);
    }
  });
});
