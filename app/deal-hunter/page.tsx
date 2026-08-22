import { notFound } from "next/navigation";
import { requireFoundingBetaAccess } from "@/lib/auth/foundingBetaAccess";
import DealHunterClient from "@/components/deal-hunter/DealHunterClient";

export const metadata = {
  title: "Deal Hunter (Alpha) — Propellect",
  description: "Your buy box, matched to labelled replay opportunities, with a decision-grade deal brief. Evidence, not advice.",
};

/**
 * Deal Hunter alpha. Invite-only: requires the warehouse-preview flag AND
 * founding-beta membership. Non-invited users get a 404 so the route's existence
 * isn't advertised. Runs on a clearly-labelled replay dataset until authorised
 * live listing access exists.
 */
export default async function DealHunterPage() {
  const access = await requireFoundingBetaAccess();
  if (!access.ok) notFound();
  return <DealHunterClient />;
}
