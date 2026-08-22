import { notFound } from "next/navigation";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import DealHunterClient from "@/components/deal-hunter/DealHunterClient";

export const metadata = {
  title: "Deal Hunter (Alpha) — Propellect",
  description: "Your buy box, matched to live opportunities, with a decision-grade deal brief. Evidence, not advice.",
};

/**
 * Deal Hunter alpha. Gated behind the existing warehouse-preview flag so Production
 * is unchanged until the feature (and migrations 059–063) are enabled. Runs on a
 * clearly-labelled replay dataset until authorised live listing access exists.
 */
export default function DealHunterPage() {
  if (!isWarehousePreviewEnabled()) notFound();
  return <DealHunterClient />;
}
