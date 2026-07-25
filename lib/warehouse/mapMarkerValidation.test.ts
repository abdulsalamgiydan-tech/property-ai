import { describe, expect, it } from "vitest";
import { validateMapMarkerParams } from "./mapMarkerValidation";

describe("validateMapMarkerParams", () => {
  it("accepts a bounded Australian viewport and supported geography type", () => {
    expect(validateMapMarkerParams({ minLat: -34, maxLat: -33, minLon: 150, maxLon: 151, type: "SAL" })).toEqual({ ok: true, geographyType: "SAL" });
  });

  it("rejects missing or non-numeric coordinates", () => {
    expect(validateMapMarkerParams({ minLat: Number.NaN, maxLat: -33, minLon: 150, maxLon: 151 }).ok).toBe(false);
  });

  it("rejects out-of-country or inverted bounding boxes", () => {
    expect(validateMapMarkerParams({ minLat: -90, maxLat: -33, minLon: 150, maxLon: 151 }).ok).toBe(false);
    expect(validateMapMarkerParams({ minLat: -33, maxLat: -34, minLon: 150, maxLon: 151 }).ok).toBe(false);
  });

  it("rejects unsupported geography types", () => {
    expect(validateMapMarkerParams({ minLat: -34, maxLat: -33, minLon: 150, maxLon: 151, type: "SA2" }).ok).toBe(false);
  });
});