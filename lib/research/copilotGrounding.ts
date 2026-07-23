/**
 * Deterministic grounding check for the research copilot (Sprint 14 WS5).
 * The system prompt instructs the model to answer only from the supplied
 * evidence pack, but a prompt instruction is not a guarantee — this is a
 * second, code-level check run on every answer before it reaches a user.
 *
 * It is a heuristic, not a proof: it extracts every dollar figure and
 * percentage the model's answer states, and confirms each one appears
 * somewhere in the evidence pack it was given. It cannot catch a
 * fabricated non-numeric claim (e.g. an invented qualitative trend), only
 * fabricated numbers — documented as a known limitation, not silently
 * treated as complete coverage.
 */
import type { EvidenceFact } from "./copilotEvidence";

const MONEY_PATTERN = /\$\d{1,3}(?:,\d{3})*(?:\.\d+)?/g;
const PERCENT_PATTERN = /\d+(?:\.\d+)?%/g;

/** Extracts every dollar-figure and percentage token from free text, in appearance order. */
export function extractNumericClaims(text: string): string[] {
  const money = text.match(MONEY_PATTERN) ?? [];
  const percent = text.match(PERCENT_PATTERN) ?? [];
  return [...money, ...percent];
}

function normaliseNumberToken(token: string): string {
  return token.replace(/[\s,]/g, "").toLowerCase();
}

export type GroundingCheckResult = {
  grounded: boolean;
  ungroundedClaims: string[];
};

/**
 * Checks that every numeric claim in the answer text also appears
 * (after stripping commas/whitespace) somewhere in the evidence pack's
 * rendered values. An answer with zero numeric claims is trivially
 * grounded — declining to answer, or answering in words only, is never
 * flagged.
 */
export function checkAnswerGrounding(answerText: string, facts: EvidenceFact[]): GroundingCheckResult {
  const claims = extractNumericClaims(answerText);
  if (claims.length === 0) return { grounded: true, ungroundedClaims: [] };

  const evidenceText = normaliseNumberToken(facts.map((f) => f.value).join(" "));
  const ungroundedClaims = claims.filter((c) => !evidenceText.includes(normaliseNumberToken(c)));

  return { grounded: ungroundedClaims.length === 0, ungroundedClaims };
}
