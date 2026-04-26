import { WatchlistClient } from "@/components/watchlist/WatchlistClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watchlist | Propellect",
  description: "Track properties and suburbs you are watching.",
};

export default function WatchlistPage() {
  return <WatchlistClient />;
}
