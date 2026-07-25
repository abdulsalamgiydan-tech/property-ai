"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { safeInternalNextPath } from "@/lib/auth/safeNextPath";
import { getOnboardingStatus } from "@/lib/supabase/onboardingPreferences";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

const AUTO_REDIRECT_MS = 2200;
const SESSION_WAIT_MS = 2800;

function AuthCompleteFallback() {
  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/85 p-8 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Propellect</p>
          <div className="mt-4 flex size-12 items-center justify-center rounded-full border border-zinc-600/50 bg-zinc-950/50">
            <span
              className="size-6 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400"
              aria-hidden
            />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Signing you in…
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Please wait while we confirm your session.
          </p>
        </div>
      </main>
    </div>
  );
}

function AuthCompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, user, authConfigured } = useAuth();
  const redirectedRef = useRef(false);
  // Sprint 14 WS2 — null while the one-time onboarding-completion check
  // is in flight; resolves to either the original nextPath or a
  // /onboarding redirect. Kept separate from nextPath itself so a slow
  // or failed check can never block the existing auth-error/timeout
  // paths above it.
  const [resolvedNextPath, setResolvedNextPath] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const raw = searchParams.get("next");
    const safe = safeInternalNextPath(raw);
    // Default to dashboard if no meaningful next path was provided
    if (!safe || safe === "/") return "/dashboard";
    return safe;
  }, [searchParams]);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    void (async () => {
      const { completed } = await getOnboardingStatus();
      if (cancelled) return;
      setResolvedNextPath(completed ? nextPath : `/onboarding?next=${encodeURIComponent(nextPath)}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, nextPath]);

  useEffect(() => {
    if (loading) return;

    if (!authConfigured) {
      if (!redirectedRef.current) {
        redirectedRef.current = true;
        router.replace(nextPath);
      }
      return;
    }

    if (!user) {
      const errTimer = window.setTimeout(() => {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/auth/error");
        }
      }, SESSION_WAIT_MS);
      return () => window.clearTimeout(errTimer);
    }

    if (resolvedNextPath == null) return; // still checking onboarding status

    const okTimer = window.setTimeout(() => {
      if (!redirectedRef.current) {
        redirectedRef.current = true;
        router.replace(resolvedNextPath);
      }
    }, AUTO_REDIRECT_MS);
    return () => window.clearTimeout(okTimer);
  }, [authConfigured, loading, nextPath, resolvedNextPath, router, user]);

  function continueNow() {
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      router.replace(resolvedNextPath ?? nextPath);
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
        <div className="rounded-2xl border border-emerald-500/20 bg-zinc-900/85 p-8 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Propellect</p>
          <div className="mt-4 flex size-12 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-950/40 text-emerald-300">
            <svg
              className="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {loading
              ? "Signing you in…"
              : user
                ? "You’re signed in"
                : "Finishing sign-in…"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {loading
              ? "Please wait a moment while we confirm your session."
              : user
                ? "Your full analysis is unlocked. We’ll take you back to where you left off."
                : "Almost there — we’re confirming your session in the browser."}
          </p>
          {!loading && user ? (
            <p className="mt-2 text-xs text-zinc-500">
              Redirecting shortly… or continue when you’re ready.
            </p>
          ) : null}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={continueNow}
              disabled={loading || !user}
              className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[11rem]"
            >
              Continue now
            </button>
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30 sm:w-auto"
            >
              Go to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={<AuthCompleteFallback />}>
      <AuthCompleteInner />
    </Suspense>
  );
}
