"use client";

import { OnboardingClient } from "@/components/onboarding/OnboardingClient";
import { useAuth } from "@/components/auth/AuthProvider";

export function SettingsClient() {
  const { user, loading, openEarlyAccessModal } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-zinc-950">
        <span className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-full bg-zinc-950 px-4 py-20 text-center text-zinc-100">
        <h1 className="text-2xl font-semibold text-white">Sign in to edit settings</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
          Preferences are stored against your account and are never used to create financial advice.
        </p>
        <button
          type="button"
          onClick={openEarlyAccessModal}
          className="mt-8 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Sign in
        </button>
      </div>
    );
  }

  return <OnboardingClient nextPathRaw="/dashboard" mode="settings" />;
}
