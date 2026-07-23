"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { EvidenceFact } from "@/lib/research/copilotEvidence";
import { trackEvent } from "@/lib/analytics/events";

type CopilotResponse = {
  answerText: string;
  grounded: boolean;
  ungroundedClaims: string[];
  evidence: EvidenceFact[];
  geographyLabel: string;
};

/**
 * Sprint 14 WS5 — grounded AI research copilot UI. Evidence is fetched
 * and the answer's numeric claims are grounding-checked entirely
 * server-side (app/api/research/copilot); this component only renders
 * what the API returns, it never builds or trusts its own "evidence".
 */
export function ResearchCopilotClient({ geographyCode, geographyLabel }: { geographyCode: string; geographyLabel: string }) {
  const { user, openEarlyAccessModal } = useAuth();
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "asking" | "answered" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<CopilotResponse | null>(null);

  async function handleAsk() {
    if (!user) {
      openEarlyAccessModal();
      return;
    }
    const trimmed = question.trim();
    if (!trimmed) return;

    setStatus("asking");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/research/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geographyCode, question: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setErrorMessage("You've reached the daily question limit for the research copilot. Try again tomorrow.");
        } else {
          setErrorMessage(body.message || "Couldn't get an answer just now — please try again.");
        }
        setStatus("error");
        return;
      }

      const body = (await res.json()) as CopilotResponse;
      setResponse(body);
      setStatus("answered");
      trackEvent({ name: "research_copilot_answered", geographyCode, grounded: body.grounded });
    } catch {
      setErrorMessage("Couldn't reach the research copilot — please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-3 text-xs leading-relaxed text-amber-200">
        Answers are generated only from {geographyLabel}&apos;s recorded market evidence below — never a forecast,
        prediction, or financial, tax or legal advice. Every numeric answer is checked against the evidence before
        being shown; if a figure can&apos;t be verified, you&apos;ll see a warning rather than a silently wrong number.
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-200" htmlFor="copilot-question">
          Ask a question about {geographyLabel}
        </label>
        <textarea
          id="copilot-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. What is the median sale price and how confident is that figure?"
          className="w-full rounded-xl border border-zinc-600/80 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20"
        />
        <button
          type="button"
          onClick={handleAsk}
          disabled={status === "asking" || !question.trim()}
          className="rounded-lg border border-violet-500/50 bg-violet-950/30 px-4 py-2 text-sm font-semibold text-violet-200 transition hover:border-violet-400/70 hover:bg-violet-900/40 disabled:cursor-wait disabled:opacity-50"
        >
          {status === "asking" ? "Asking…" : user ? "Ask" : "Sign in to ask"}
        </button>
      </div>

      {status === "error" && errorMessage ? (
        <p className="text-xs text-red-300" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {status === "answered" && response ? (
        <div className="space-y-3 rounded-xl border border-zinc-700/60 bg-zinc-950/40 p-4">
          <p className="text-sm leading-relaxed text-zinc-100">{response.answerText}</p>

          {!response.grounded ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200" role="alert">
              This answer includes a figure that couldn&apos;t be verified against the recorded evidence below
              ({response.ungroundedClaims.join(", ")}) — treat it with caution.
            </p>
          ) : null}

          <div className="border-t border-zinc-800 pt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
              Evidence used to answer this question
            </p>
            <ul className="space-y-1 text-xs text-zinc-400">
              {response.evidence.map((f) => (
                <li key={f.id}>
                  {f.label}: <span className="text-zinc-200">{f.value}</span>
                  {f.confidence ? <span className="text-zinc-600"> · confidence: {f.confidence}</span> : null}
                  {f.sourcePeriod ? <span className="text-zinc-600"> · as at {f.sourcePeriod}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
