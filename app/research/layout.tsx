import { notFound } from "next/navigation";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { DisclaimerFooter } from "@/components/design/DisclaimerFooter";

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  // Feature-flag gate: disabled by default, and safe (returns 404, never
  // throws) when WAREHOUSE_PREVIEW_ENABLED is absent — including in a
  // production build that has no warehouse env vars configured at all.
  if (!isWarehousePreviewEnabled()) notFound();

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-950/15 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
          Internal research preview. Descriptive market data only — not financial,
          tax or legal advice, not an investment recommendation, and not a
          forecast. Figures combine independently-sourced official datasets;
          always check the confidence label and source period before relying on
          a number.
        </div>
        {children}
        <DisclaimerFooter className="mt-10" />
      </div>
    </div>
  );
}
