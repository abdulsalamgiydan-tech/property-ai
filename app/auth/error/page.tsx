"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { safeInternalNextPath } from "@/lib/auth/safeNextPath";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AuthErrorFallback() {
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
            Loading…
          </h1>
        </div>
      </main>
    </div>
  );
}

function copyForErrorCode(errorCode: string | null): { title: string; body: string } {
  switch (errorCode) {
    case "otp_expired":
      return {
        title: "This link has expired",
        body: "Magic links are single-use and time-limited. Request a fresh sign-in link and open it promptly — if the link was already used, you may already be signed in on that device.",
      };
    case "session_exchange_failed":
    case "missing_token":
      return {
        title: "Sign-in could not be completed",
        body: "The confirmation link was incomplete, invalid, or could not be exchanged for a session. Please send yourself a new sign-in link and try again.",
      };
    case "not_configured":
      return {
        title: "Sign-in is not available",
        body: "This environment is missing Supabase configuration, so we cannot complete sign-in.",
      };
    default:
      return {
        title: "Link expired or invalid",
        body: "This sign-in link has expired, was already used, or is not valid any more. Please request a fresh link to continue.",
      };
  }
}

function AuthErrorInner() {
  const { openEarlyAccessModal, authConfigured } = useAuth();
  const searchParams = useSearchParams();

  const errorCode = searchParams.get("error_code");
  const nextPath = safeInternalNextPath(searchParams.get("next"));

  const { title, body } = copyForErrorCode(errorCode);

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/85 p-8 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Propellect</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">{body}</p>
          {!authConfigured ? (
            <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
              Sign-in is not fully configured yet. Add your Supabase URL and anon key in{" "}
              <code className="rounded bg-zinc-950/80 px-1 py-0.5 text-[11px] text-zinc-300">.env.local</code>{" "}
              and try again.
            </p>
          ) : null}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => openEarlyAccessModal()}
              className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40 sm:w-auto sm:min-w-[12rem]"
            >
              Send a new sign-in link
            </button>
            {nextPath !== "/" ? (
              <Link
                href={nextPath}
                className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30 sm:w-auto sm:min-w-[10rem]"
              >
                Back to the tool
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30 sm:w-auto sm:min-w-[10rem]"
              >
                Back to home
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<AuthErrorFallback />}>
      <AuthErrorInner />
    </Suspense>
  );
}
