import { describe, expect, it } from "vitest";
import { matchStashLocality, type PropellectLocalityIdentity } from "./localityMatch";
import { calderwoodStashLocalities } from "./fixtures";

const calderwood: PropellectLocalityIdentity = {
  geographyId: "SAL_10749_ASGS3_2021",
  suburb: "Calderwood",
  state: "NSW",
  postcode: "2527",
};

describe("matchStashLocality", () => {
  it("matches on suburb + state + postcode together", () => {
    const res = matchStashLocality(calderwood, calderwoodStashLocalities);
    expect(res.matched).toBe(true);
    if (res.matched) {
      expect(res.locality.locality_id).toBe("stash-loc-2527-calderwood");
      expect(res.geographyId).toBe("SAL_10749_ASGS3_2021");
    }
  });

  it("refuses a name-only match when the state differs (Calderwood NSW vs VIC)", () => {
    const res = matchStashLocality(
      { ...calderwood, postcode: "9999" }, // no NSW postcode match; only a VIC same-name decoy exists
      calderwoodStashLocalities
    );
    expect(res.matched).toBe(false);
  });

  it("refuses when suburb + state match but postcode differs (never mixes postcodes)", () => {
    const res = matchStashLocality({ ...calderwood, postcode: "2500" }, calderwoodStashLocalities);
    expect(res.matched).toBe(false);
    if (!res.matched) expect(res.reason).toContain("postcode");
  });

  it("requires all three identity fields — incomplete identity never matches", () => {
    expect(matchStashLocality({ ...calderwood, postcode: "" }, calderwoodStashLocalities).matched).toBe(false);
    expect(matchStashLocality({ ...calderwood, state: "" }, calderwoodStashLocalities).matched).toBe(false);
  });

  it("normalises disambiguation suffixes so 'Calderwood (NSW)' still matches", () => {
    const res = matchStashLocality({ ...calderwood, suburb: "Calderwood (NSW)" }, calderwoodStashLocalities);
    expect(res.matched).toBe(true);
  });

  it("reports a specific reason (not a bare 'not found') when nothing matches", () => {
    const res = matchStashLocality({ ...calderwood, suburb: "Nowhereville" }, calderwoodStashLocalities);
    expect(res.matched).toBe(false);
    if (!res.matched) expect(res.reason).toMatch(/suburb name/);
  });
});
