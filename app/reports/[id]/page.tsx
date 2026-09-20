import { SavedReportClient } from "@/components/reports/SavedReportClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved Report | Propellect",
  description: "View your saved property investment report.",
};

export default async function SavedReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <SavedReportClient reportId={id} />;
}
