"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OnboardingClient } from "@/components/onboarding/OnboardingClient";

// Sprint 14 WS2. Client component (matches app/auth/complete/page.tsx's
// pattern) since it needs useSearchParams for the post-onboarding
// redirect target.
function OnboardingInner() {
  const searchParams = useSearchParams();
  return <OnboardingClient nextPathRaw={searchParams.get("next")} />;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  );
}
