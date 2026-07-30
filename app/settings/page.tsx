import { Suspense } from "react";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const metadata = {
  title: "Settings | Propellect",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] bg-zinc-950" />}>
      <SettingsClient />
    </Suspense>
  );
}
