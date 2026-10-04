import { describe, expect, it, vi } from "vitest";

let access: { ok: boolean } = { ok: true };
const notFoundMock = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/auth/foundingBetaAccess", () => ({ requireFoundingBetaAccess: async () => access }));
vi.mock("@/components/deal-hunter/DealHunterClient", () => ({ default: () => "DealHunterClient" }));

import DealHunterPage from "./page";

describe("/deal-hunter page access", () => {
  it("renders for an invited founding-beta user", async () => {
    access = { ok: true };
    await expect(DealHunterPage()).resolves.toBeTruthy();
  });

  it("denies page-level access when the server gate fails", async () => {
    access = { ok: false };
    await expect(DealHunterPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
