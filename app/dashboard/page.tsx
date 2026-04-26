import { DashboardClient } from "@/components/dashboard/DashboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | Propellect",
  description: "Your saved property reports, comparisons, watchlist, and portfolio.",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
