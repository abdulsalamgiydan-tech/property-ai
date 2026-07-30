export type MapMarkerParams = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  type?: string | null;
};

export type MapMarkerValidationResult =
  | { ok: true; geographyType?: "SAL" | "POA" | "LGA" }
  | { ok: false; error: string };

export function validateMapMarkerParams(params: MapMarkerParams): MapMarkerValidationResult {
  const { minLat, maxLat, minLon, maxLon, type } = params;
  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) {
    return { ok: false, error: "minLat, maxLat, minLon, maxLon are required numeric query params" };
  }
  if (minLat < -45 || maxLat > -8 || minLon < 108 || maxLon > 156) {
    return { ok: false, error: "bounding box must be within Australia" };
  }
  if (minLat >= maxLat || minLon >= maxLon) {
    return { ok: false, error: "invalid bounding box: min must be less than max" };
  }
  if (type && type !== "SAL" && type !== "POA" && type !== "LGA") {
    return { ok: false, error: "type must be SAL, POA or LGA" };
  }
  return { ok: true, geographyType: type === "SAL" || type === "POA" || type === "LGA" ? type : undefined };
}