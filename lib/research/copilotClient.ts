import "server-only";

/**
 * Grounded research copilot LLM client (Sprint 14 WS5). Reuses the same
 * already-configured ANTHROPIC_API_KEY and raw fetch pattern as
 * lib/strategy/claudeClient.ts — no new paid provider is activated for
 * this feature, per the brief's explicit constraint.
 *
 * The model is given ONLY the evidence pack text and the user's
 * question, with a system prompt that forbids it from stating any
 * figure not present in that evidence. This client does not itself
 * enforce that constraint — lib/research/copilotGrounding.ts is the
 * deterministic, code-level check run on the returned text by the
 * caller (the API route), never skipped.
 */

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicMessageResponse = {
  content?: AnthropicContentBlock[];
  error?: { message?: string };
};

const MODEL = "claude-sonnet-4-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_ANSWER_TOKENS = 500;
const REQUEST_TIMEOUT_MS = 15_000;

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return key.trim();
}

function buildSystemPrompt(evidenceText: string): string {
  return [
    "You are a descriptive research assistant for an Australian residential property research tool.",
    "Answer the user's question using ONLY the evidence listed below. Do not use any other knowledge, training data, or assumption about this area.",
    "Rules, no exceptions:",
    "1. Never state a dollar figure, percentage, or count that is not explicitly present in the evidence below.",
    "2. If the evidence does not contain the answer, say so plainly instead of guessing or estimating.",
    "3. Never predict, forecast, or speculate about future prices, rents, or growth — only describe what the evidence shows about the recorded past.",
    "4. Never give financial, tax, legal or investment advice, and never recommend buying, selling or holding.",
    "5. Keep the answer to 3 sentences or fewer.",
    "",
    "Evidence:",
    evidenceText,
  ].join("\n");
}

export type CopilotAnswer = {
  answerText: string;
};

export async function answerResearchQuestion(evidenceText: string, question: string): Promise<CopilotAnswer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_ANSWER_TOKENS,
        temperature: 0.2,
        system: buildSystemPrompt(evidenceText),
        messages: [{ role: "user", content: question }],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = (await res.json()) as AnthropicMessageResponse;

  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText;
    throw new Error(`Copilot API error: ${msg}`);
  }

  const text = data.content?.[0]?.type === "text" ? data.content[0].text : undefined;
  if (!text?.trim()) {
    throw new Error("Copilot returned an empty response");
  }

  return { answerText: text.trim() };
}
