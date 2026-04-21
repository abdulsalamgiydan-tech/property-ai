"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
