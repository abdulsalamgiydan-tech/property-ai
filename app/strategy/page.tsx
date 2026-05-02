import { StrategyClient } from "@/components/strategy/StrategyClient";
import { StrategyGuestSplash } from "@/components/strategy/StrategyGuestSplash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strategy Generator | Propellect",
  description:
    "Deterministic archetype selection and a personalised Australian residential property investment strategy.",
};

export default async function StrategyPage() {
  let authenticated = false;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      authenticated = Boolean(user);
    } catch {
      authenticated = false;
    }
  }

  return authenticated ? <StrategyClient /> : <StrategyGuestSplash />;
}
