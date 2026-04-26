import { SavedReportClient } from "@/components/reports/SavedReportClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved Report | Propellect",
  description: "View your saved property investment report.",
};

export default function SavedReportPage({ params }: { params: { id: string } }) {
  return <SavedReportClient reportId={params.id} />;
}
