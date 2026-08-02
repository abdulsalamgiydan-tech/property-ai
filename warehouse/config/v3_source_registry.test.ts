import { describe, expect, it } from "vitest";
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

  it("only the SA CC-BY lanes are accepted this sprint (others recorded with a precise blocker)", () => {
    expect(ACCEPTED.map((s) => s.id).sort()).toEqual(["sa_metro_median_house_sales", "sa_private_rental_report"]);
    // 403-blocked lanes are recorded, not circumvented
    expect(V3_SOURCES.find((s) => s.id === "vic_vg_property_sales")?.disposition).toBe("temporarily_unreachable");
    expect(V3_SOURCES.find((s) => s.id === "tas_rental_bonds")?.reachability).toBe(403);
    // the 2.3GB local collection is never promotable
    expect(V3_SOURCES.find((s) => s.id === "local_2p3gb_collection")?.disposition).toBe("provenance_unverified");
  });
});
