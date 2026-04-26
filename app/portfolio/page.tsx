import { PortfolioClient } from "@/components/portfolio/PortfolioClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio | Propellect",
  description: "Track your property portfolio — total value, debt, equity, and cashflow.",
};

export default function PortfolioPage() {
  return <PortfolioClient />;
}
