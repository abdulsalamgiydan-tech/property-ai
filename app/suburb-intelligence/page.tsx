import { SuburbIntelligenceClient } from "@/components/suburb/SuburbIntelligenceClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Suburb Intelligence | Propellect",
  description: "Understand the investment profile of Australian suburbs.",
};

export default function SuburbIntelligencePage() {
  return <SuburbIntelligenceClient />;
}
