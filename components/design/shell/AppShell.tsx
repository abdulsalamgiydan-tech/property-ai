import React, { type ReactNode } from "react";
import { DisclaimerFooter } from "@/components/design/DisclaimerFooter";

type AppShellProps = {
  navbar?: ReactNode;
  mobileNav?: ReactNode;
  children: ReactNode;
  showDisclaimer?: boolean;
  className?: string;
};

export function AppShell({
  navbar,
  mobileNav,
  children,
  showDisclaimer = true,
  className,
}: AppShellProps) {
  return (
    <div className={`min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100 ${className ?? ""}`}>
      {navbar ? <div className="sticky top-0 z-40">{navbar}</div> : null}
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      {showDisclaimer ? <DisclaimerFooter /> : null}
      {mobileNav ? <div className="sticky bottom-0 z-40 md:hidden">{mobileNav}</div> : null}
    </div>
  );
}
