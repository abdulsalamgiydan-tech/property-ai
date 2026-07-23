"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/events";

/**
 * Sprint 14 WS19 — fires the "profile_opened" analytics event once per
 * suburb/postcode profile view. The event type has existed in the
 * analytics contract (lib/analytics/events.ts) since Sprint 13 but was
 * never actually wired to a call site — this closes that gap.
 * Renders nothing; MarketSnapshotView (a server component) stays server-
 * rendered, with only this tiny leaf needing "use client".
 */
export function ProfileViewTracker({
  geographyType,
  geographyCode,
}: {
  geographyType: "suburb" | "postcode";
  geographyCode: string;
}) {
  useEffect(() => {
    if (!geographyCode) return;
    trackEvent({ name: "profile_opened", geographyType, geographyCode });
  }, [geographyType, geographyCode]);

  return null;
}
