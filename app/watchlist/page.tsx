import { WatchlistClient } from "@/components/watchlist/WatchlistClient";
import { isWarehousePreviewEnabled, isMultiStateResearchEnabled } from "@/lib/warehouse/env";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watchlist | Propellect",
  description: "Track properties and suburbs you are watching.",
};

export default function WatchlistPage() {
  const geographySearchEnabled = isWarehousePreviewEnabled() && isMultiStateResearchEnabled();
  return <WatchlistClient geographySearchEnabled={geographySearchEnabled} />;
}
