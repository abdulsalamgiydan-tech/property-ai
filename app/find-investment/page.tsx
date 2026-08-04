import { notFound } from "next/navigation";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import FindInvestmentClient from "@/components/find-investment/FindInvestmentClient";

export const metadata = {
  title: "Find My Investment — Propellect",
  description: "Given your situation and strategy, where should you consider investing — and why.",
};

/**
 * Premium "Find My Investment" flow. Gated behind the existing warehouse-preview
 * flag so Production behaviour is unchanged until the feature (and migration 059)
 * are enabled. Research Hub / Explore / Map / Compare / auth are untouched.
 */
export default function FindInvestmentPage() {
  if (!isWarehousePreviewEnabled()) notFound();
  return <FindInvestmentClient />;
}
