import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFound, isWarehousePreviewEnabled } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  isWarehousePreviewEnabled: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/warehouse/env", () => ({ isWarehousePreviewEnabled }));

vi.mock("@/components/suburb/SuburbIntelligenceClient", () => ({
  SuburbIntelligenceClient: () => "SuburbIntelligenceClient",
}));

import SuburbIntelligencePage from "./page";

describe("SuburbIntelligencePage", () => {
  beforeEach(() => {
    notFound.mockClear();
    isWarehousePreviewEnabled.mockReset();
  });

  it("fails closed with notFound() when the warehouse preview flag is off (Production today)", () => {
    isWarehousePreviewEnabled.mockReturnValue(false);
    expect(() => SuburbIntelligencePage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("renders the placeholder client when the warehouse preview flag is on (Preview)", () => {
    isWarehousePreviewEnabled.mockReturnValue(true);
    expect(() => SuburbIntelligencePage()).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });
});
