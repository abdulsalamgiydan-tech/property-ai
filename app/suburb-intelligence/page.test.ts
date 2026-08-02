import { afterEach, describe, expect, it, vi } from "vitest";

const { notFound, isWarehousePreviewEnabled } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  isWarehousePreviewEnabled: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/warehouse/env", () => ({ isWarehousePreviewEnabled }));

import SuburbIntelligencePage from "./page";

describe("SuburbIntelligencePage", () => {
  afterEach(() => {
    notFound.mockClear();
    isWarehousePreviewEnabled.mockReset();
  });

  // The legacy Suburb Intelligence page must fail closed with the app's
  // standard 404 for a direct request, independent of any feature flag — so
  // enabling the /research preview can never expose this unfinished page.
  it("always throws the standard NEXT_NOT_FOUND when the warehouse preview flag is off", () => {
    isWarehousePreviewEnabled.mockReturnValue(false);
    expect(() => SuburbIntelligencePage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("always throws the standard NEXT_NOT_FOUND even when the warehouse preview flag is on", () => {
    isWarehousePreviewEnabled.mockReturnValue(true);
    expect(() => SuburbIntelligencePage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
