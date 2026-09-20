import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  from: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: supabaseMocks.createBrowserSupabaseClient,
}));

import { deleteComparison } from "@/lib/supabase/comparisons";
import { removePortfolioProperty } from "@/lib/supabase/portfolio";
import { deletePropertyReport } from "@/lib/supabase/reports";
import { removeFromWatchlist } from "@/lib/supabase/watchlist";

type DeleteResult = { ok: boolean; message?: string };

const deleteCases: Array<{
  name: string;
  table: string;
  run: (id: string) => Promise<DeleteResult>;
  missingMessage: string;
}> = [
  {
    name: "watchlist item",
    table: "watchlist_items",
    run: removeFromWatchlist,
    missingMessage: "Watchlist item not found or you do not have permission to remove it.",
  },
  {
    name: "property report",
    table: "property_reports",
    run: deletePropertyReport,
    missingMessage: "Report not found or you do not have permission to delete it.",
  },
  {
    name: "portfolio property",
    table: "portfolio_properties",
    run: removePortfolioProperty,
    missingMessage: "Portfolio property not found or you do not have permission to remove it.",
  },
  {
    name: "comparison",
    table: "property_comparisons",
    run: deleteComparison,
    missingMessage: "Comparison not found or you do not have permission to delete it.",
  },
];

describe("Supabase delete helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.createBrowserSupabaseClient.mockReturnValue({
      from: supabaseMocks.from,
    });
    supabaseMocks.from.mockReturnValue({ delete: supabaseMocks.delete });
    supabaseMocks.delete.mockReturnValue({ eq: supabaseMocks.eq });
    supabaseMocks.eq.mockReturnValue({ select: supabaseMocks.select });
    supabaseMocks.select.mockReturnValue({ maybeSingle: supabaseMocks.maybeSingle });
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: { id: "owned-row-id" },
      error: null,
    });
  });

  it.each(deleteCases)("confirms the $name row was deleted", async ({ table, run }) => {
    await expect(run("owned-row-id")).resolves.toEqual({ ok: true });

    expect(supabaseMocks.from).toHaveBeenCalledWith(table);
    expect(supabaseMocks.delete).toHaveBeenCalledOnce();
    expect(supabaseMocks.eq).toHaveBeenCalledWith("id", "owned-row-id");
    expect(supabaseMocks.select).toHaveBeenCalledWith("id");
    expect(supabaseMocks.maybeSingle).toHaveBeenCalledOnce();
  });

  it.each(deleteCases)(
    "reports failure when the $name delete affects no visible row",
    async ({ run, missingMessage }) => {
      supabaseMocks.maybeSingle.mockResolvedValue({ data: null, error: null });

      await expect(run("missing-row-id")).resolves.toEqual({
        ok: false,
        message: missingMessage,
      });
    }
  );

  it.each(deleteCases)("preserves database errors for the $name", async ({ run }) => {
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "Database unavailable" },
    });

    await expect(run("owned-row-id")).resolves.toEqual({
      ok: false,
      message: "Database unavailable",
    });
  });
});
