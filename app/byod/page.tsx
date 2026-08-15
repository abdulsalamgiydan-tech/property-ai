import { notFound } from "next/navigation";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { foundingBetaGateOpen } from "@/lib/auth/foundingBeta";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import BringYourOwnDealClient from "@/components/byod/BringYourOwnDealClient";

export const metadata = {
  title: "Bring Your Own Deal (Founding Beta) — Propellect",
  description: "Score a property you found yourself against your buy box, with official market evidence. Invite-only.",
};

/**
 * V8 Bring Your Own Deal. Invite-only: requires the warehouse-preview flag AND
 * founding-beta membership (email allowlist). Non-invited users get a 404 so the
 * route's existence isn't advertised. Production is unchanged until the flag +
 * migration 065 are explicitly enabled.
 */
export default async function ByodPage() {
  if (!isWarehousePreviewEnabled()) notFound();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!foundingBetaGateOpen(data.user?.email)) notFound();
  return <BringYourOwnDealClient />;
}
