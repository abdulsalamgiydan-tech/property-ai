import { describe, expect, it } from "vitest";
import { buildResolver, normalizeName } from "./resolveSal.mjs";

const spine = [
  { geography_id: "SAL_40001_ASGS3_2021", geography_code: "40001", geography_name: "Aberfoyle Park", state_code: "4" },
  { geography_id: "SAL_40002_ASGS3_2021", geography_code: "40002", geography_name: "Adelaide", state_code: "4" },
  { geography_id: "SAL_10001_ASGS3_2021", geography_code: "10001", geography_name: "Richmond", state_code: "1" }, // NSW Richmond
  { geography_id: "SAL_20001_ASGS3_2021", geography_code: "20001", geography_name: "Richmond", state_code: "2" }, // VIC Richmond
  { geography_id: "SAL_40099_ASGS3_2021", geography_code: "40099", geography_name: "Richmond", state_code: "4" }, // SA Richmond
];

describe("suburb -> SAL resolution", () => {
  const resolveSA = buildResolver(spine, "4");

  it("resolves a SA suburb by name+state (case/format-insensitive)", () => {
    expect(resolveSA("ABERFOYLE PARK")).toMatchObject({ matched: true, geographyId: "SAL_40001_ASGS3_2021" });
    expect(resolveSA("Aberfoyle Park")).toMatchObject({ matched: true, geographyCode: "40001" });
  });

  it("never matches by name alone — a NSW/VIC Richmond is invisible to the SA resolver", () => {
    // 'Richmond' exists in NSW, VIC and SA; the SA resolver only sees the SA one.
    expect(resolveSA("Richmond")).toMatchObject({ matched: true, geographyId: "SAL_40099_ASGS3_2021" });
    const resolveNSW = buildResolver(spine, "1");
    expect(resolveNSW("Richmond")).toMatchObject({ matched: true, geographyId: "SAL_10001_ASGS3_2021" });
  });

  it("quarantines an unknown locality rather than guessing", () => {
    expect(resolveSA("Nowhereville")).toEqual({ matched: false, reason: "geography_unmatched" });
    expect(resolveSA("")).toEqual({ matched: false, reason: "empty_locality" });
  });

  it("flags a genuinely ambiguous same-name-same-state collision", () => {
    const dup = [
      { geography_id: "SAL_A", geography_code: "A", geography_name: "Twin", state_code: "4" },
      { geography_id: "SAL_B", geography_code: "B", geography_name: "Twin", state_code: "4" },
    ];
    expect(buildResolver(dup, "4")("Twin")).toEqual({ matched: false, reason: "ambiguous_geography" });
  });

  it("normalizeName strips punctuation and disambiguators", () => {
    expect(normalizeName("Abbotsford (NSW)")).toBe("abbotsford");
    expect(normalizeName("O'Halloran Hill")).toBe("o halloran hill");
  });
});
