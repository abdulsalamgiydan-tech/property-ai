import { AnalysePropertyClient } from "@/components/analyse/AnalysePropertyClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analyse a Property | Property Investment Analyser",
  description:
    "Test Australian residential investment property cashflow, tax, depreciation and long-term projections.",
};

export default function AnalysePropertyPage() {
  return <AnalysePropertyClient />;
}
