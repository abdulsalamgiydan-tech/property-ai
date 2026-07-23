"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { submitFeedback, type FeedbackCategory } from "@/lib/supabase/feedback";
import { trackEvent } from "@/lib/analytics/events";

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: "bug", label: "Something's broken" },
  { id: "idea", label: "Idea / suggestion" },
  { id: "other", label: "Other" },
];

/**
 * Sprint 14 WS21 — a small, always-reachable in-app feedback widget.
 * Only renders for a signed-in user (feedback is attributed, matching
 * every other write-feature in this app). Fixed-position rather than a
 * Navbar link, to avoid crowding the nav's already-dense link list —
 * positioned to clear the existing mobile floating account/sign-in
 * buttons (bottom-[5.1rem]) by sitting higher up.
 */
export function FeedbackWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!user) return null;

  async function handleSubmit() {
    setStatus("sending");
    setErrorMessage(null);
    const result = await submitFeedback(category, message, pathname);
    if (result.ok) {
      setStatus("sent");
      setMessage("");
      trackEvent({ name: "feedback_submitted", category });
    } else {
      setStatus("error");
      setErrorMessage(result.message ?? "Couldn't send feedback — please try again.");
    }
  }

  function closeAndReset() {
    setOpen(false);
    setStatus("idle");
    setErrorMessage(null);
  }

  return (
    <div className="fixed bottom-[8.5rem] right-3 z-40 lg:bottom-6 lg:right-6 print:hidden">
      {open ? (
        <div className="mb-3 w-72 rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-md sm:w-80">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Send feedback</h2>
            <button
              type="button"
              onClick={closeAndReset}
              aria-label="Close feedback form"
              className="rounded text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35"
            >
              ✕
            </button>
          </div>

          {status === "sent" ? (
            <div aria-live="polite">
              <p className="text-sm text-emerald-300">Thanks — your feedback has been sent.</p>
              <button
                type="button"
                onClick={closeAndReset}
                className="mt-3 w-full rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <label className="mb-2 block text-xs text-zinc-500" htmlFor="feedback-category">
                What&apos;s this about?
              </label>
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className="mb-3 w-full rounded-lg border border-zinc-700/70 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-200 focus:border-violet-500/60 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <label className="mb-1 block text-xs text-zinc-500" htmlFor="feedback-message">
                Your feedback
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Tell us what's on your mind…"
                className="w-full rounded-lg border border-zinc-700/70 bg-zinc-950/60 px-2.5 py-2 text-xs text-zinc-100 outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20"
              />

              {status === "error" && errorMessage ? (
                <p className="mt-2 text-xs text-red-300" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={status === "sending" || !message.trim()}
                className="mt-3 w-full rounded-lg border border-violet-500/50 bg-violet-950/30 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:border-violet-400/70 hover:bg-violet-900/40 disabled:cursor-wait disabled:opacity-50"
              >
                {status === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close feedback form" : "Open feedback form"}
        className="rounded-full border border-violet-500/40 bg-violet-600/90 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40"
      >
        {open ? "Close" : "Feedback"}
      </button>
    </div>
  );
}
