"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { savePropertyReport } from "@/lib/supabase/reports";
import type { PropertyAnalysisInputs, PropertyAnalysisResult } from "@/lib/propertyAnalysis";
import { useState } from "react";

type SaveReportButtonProps = {
  inputs: PropertyAnalysisInputs;
  results: PropertyAnalysisResult;
  propertyName?: string;
  address?: string;
  onSaved?: (reportId: string) => void;
};

export function SaveReportButton({
  inputs,
  results,
  propertyName,
  address,
  onSaved,
}: SaveReportButtonProps) {
  const { user, openEarlyAccessModal } = useAuth();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!user) {
      openEarlyAccessModal();
      return;
    }

    setSaving(true);
    setError(null);

    const res = await savePropertyReport({
      propertyName,
      address,
      inputs,
      results,
    });

    setSaving(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    setSavedId(res.id);
    onSaved?.(res.id);
  }

  if (savedId) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-2.5 text-sm text-emerald-200">
          <svg
            className="size-4 shrink-0"
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
          Report saved
        </div>
        <a
          href={`/reports/${savedId}`}
          className="inline-flex items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
        >
          View saved report →
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/50 bg-violet-950/30 px-4 py-2.5 text-sm font-semibold text-violet-200 shadow-sm transition hover:border-violet-400/70 hover:bg-violet-900/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30 disabled:cursor-wait disabled:opacity-70"
      >
        {saving ? (
          <>
            <span
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300"
              aria-hidden
            />
            Saving…
          </>
        ) : (
          <>
            <svg
              className="size-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {user ? "Save report" : "Save report (sign in required)"}
          </>
        )}
      </button>
      {!user && (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Create a free account to save this report to your dashboard.
        </p>
      )}
      {error && (
        <p className="text-xs leading-relaxed text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
