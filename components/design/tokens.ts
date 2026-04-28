export const designTokens = {
  bg: "#060A10",
  surface: "#0D1117",
  elevated: "#131A24",
  text: "#F0F2F5",
  muted: "#8892A4",
  subtle: "#4A5568",
  violet: "#7C3AED",
  violetSoft: "#A78BFA",
  emerald: "#34D399",
  amber: "#F59E0B",
  red: "#EF4444",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.12)",
} as const;

export type DealStatus = "green" | "amber" | "red";

export function statusLabel(status: DealStatus): string {
  if (status === "green") return "Green status";
  if (status === "amber") return "Amber status";
  return "Red status";
}

export function statusClasses(status: DealStatus): string {
  if (status === "green") {
    return "border-emerald-500/35 bg-emerald-950/35 text-emerald-200";
  }
  if (status === "amber") {
    return "border-amber-500/35 bg-amber-950/35 text-amber-200";
  }
  return "border-red-500/35 bg-red-950/35 text-red-200";
}
