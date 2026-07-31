import { notFound } from "next/navigation";
import { SuburbIntelligenceClient } from "@/components/suburb/SuburbIntelligenceClient";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Suburb Intelligence | Propellect",
  description: "Understand the investment profile of Australian suburbs.",
};

export default function SuburbIntelligencePage() {
  // Feature-flag gate, same pattern as app/research/layout.tsx. This page's
  // metric cards are placeholders for warehouse data that only exists where
  // WAREHOUSE_PREVIEW_ENABLED is on. Previously ungated, so the placeholder
  // ("Data coming soon") stayed live in Production even though Research
  // itself was correctly gated — Sprint 18.1 hotfix, found via real
  // authenticated Production UAT.
  if (!isWarehousePreviewEnabled()) notFound();
  return <SuburbIntelligenceClient />;
}
