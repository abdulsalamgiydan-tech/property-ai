"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

const classes =
  "inline-flex min-w-40 items-center justify-center rounded-xl border border-violet-500/45 bg-violet-950/25 px-5 py-3 text-sm font-semibold text-violet-200 transition hover:bg-violet-950/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30";

/**
 * Keeps the homepage account action in sync with the authenticated shell.
 * The surrounding homepage stays a Server Component; only this small boundary
 * needs browser auth state.
 */
export function HomeAccountCTA() {
  const { user, loading, openEarlyAccessModal } = useAuth();

  if (loading) {
    return (
      <span className={`${classes} cursor-wait opacity-70`} role="status" aria-label="Checking account status">
        Checking account…
      </span>
    );
  }

  if (user) {
    return (
      <Link href="/dashboard" className={classes}>
        Open my dashboard
      </Link>
    );
  }

  return (
    <button type="button" className={classes} onClick={openEarlyAccessModal}>
      Sign in / Get started
    </button>
  );
}
