"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { submitFeedback, type FeedbackCategory } from "@/lib/supabase/feedback";
import { trackEvent } from "@/lib/analytics/events";

const categories: { id: FeedbackCategory; label: string }[] = [
  { id: "bug", label: "Bug report" },
  { id: "feature_request", label: "Feature request" },
  { id: "general", label: "General feedback" },
  { id: "other", label: "Other" },
];

function createSubmissionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function FeedbackWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [satisfactionScore, setSatisfactionScore] = useState<number | null>(null);
  const [contactPermission, setContactPermission] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState(createSubmissionId);

  const charsRemaining = useMemo(() => 1000 - message.length, [message.length]);

  if (!user) return null;

  async function handleSubmit() {
    if (status === "sending") return;
    setStatus("sending");
    setErrorMessage(null);
    const result = await submitFeedback({
      category,
      message,
      pagePath: pathname,
      satisfactionScore,
      contactPermission,
      clientSubmissionId: submissionId,
    });
    if (result.ok) {
      setStatus("sent");
      setMessage("");
      setSatisfactionScore(null);
      setContactPermission(false);
      setSubmissionId(createSubmissionId());
      trackEvent({ name: "feedback_submitted", category });
    } else {
      setStatus("error");
      if (result.rateLimited) trackEvent({ name: "feedback_rate_limited", category });
      setErrorMessage(result.message ?? "Could not send feedback. Please try again.");
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
        <div className="mb-3 w-[21rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-100">Send feedback</h2>
            <button type="button" onClick={closeAndReset} aria-label="Close feedback form" className="rounded text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35">
              x
            </button>
          </div>

          {status === "sent" ? (
            <div aria-live="polite">
              <p className="text-sm text-emerald-300">Thanks. Your feedback has been sent.</p>
              <button type="button" onClick={closeAndReset} className="mt-3 w-full rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                Close
              </button>
            </div>
          ) : (
            <>
              <label className="mb-2 block text-xs text-zinc-500" htmlFor="feedback-category">Type</label>
              <select id="feedback-category" value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)} className="mb-3 w-full rounded-lg border border-zinc-700/70 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-200 focus:border-violet-500/60 focus:outline-none">
                {categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>

              <fieldset className="mb-3">
                <legend className="mb-2 text-xs text-zinc-500">Satisfaction score (optional)</legend>
                <div className="grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button key={score} type="button" aria-pressed={satisfactionScore === score} onClick={() => setSatisfactionScore(satisfactionScore === score ? null : score)} className={`rounded-lg border px-2 py-1.5 text-xs ${satisfactionScore === score ? "border-violet-500 bg-violet-950/35 text-violet-100" : "border-zinc-700 bg-zinc-950/60 text-zinc-300"}`}>
                      {score}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="mb-1 block text-xs text-zinc-500" htmlFor="feedback-message">Details</label>
              <textarea id="feedback-message" value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} rows={5} maxLength={1000} placeholder="Tell us what happened or what would help." className="w-full rounded-lg border border-zinc-700/70 bg-zinc-950/60 px-2.5 py-2 text-xs text-zinc-100 outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20" />
              <p className="mt-1 text-right text-[10px] text-zinc-600">{charsRemaining} characters left</p>

              <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={contactPermission} onChange={(e) => setContactPermission(e.target.checked)} className="mt-0.5" />
                Propellect may contact me about this feedback.
              </label>

              {status === "error" && errorMessage ? <p className="mt-2 text-xs text-red-300" role="alert">{errorMessage}</p> : null}

              <button type="button" onClick={handleSubmit} disabled={status === "sending" || !message.trim()} className="mt-3 w-full rounded-lg border border-violet-500/50 bg-violet-950/30 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:border-violet-400/70 hover:bg-violet-900/40 disabled:cursor-wait disabled:opacity-50">
                {status === "sending" ? "Sending..." : "Send feedback"}
              </button>
            </>
          )}
        </div>
      ) : null}

      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={open ? "Close feedback form" : "Open feedback form"} className="rounded-full border border-violet-500/40 bg-violet-600/90 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40">
        {open ? "Close" : "Feedback"}
      </button>
    </div>
  );
}
