import { ComparePropertiesClient } from "@/components/compare/ComparePropertiesClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare 2 Properties | Property Investment Analyser",
  description:
    "Compare two Australian residential investment properties side by side: cashflow, tax, depreciation and long-term projections.",
};

export default function ComparePropertiesPage() {
  return <ComparePropertiesClient />;
}
