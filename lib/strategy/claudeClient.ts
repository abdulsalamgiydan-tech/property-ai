import "server-only";

import type { Archetype } from "@/lib/strategy/archetypes";
import { parseStrategyOutputJson, type StrategyOutput } from "@/lib/strategy/strategyOutput";
import type { StrategyInput } from "@/lib/strategy/strategyInput";
import { STRATEGY_SYSTEM_PROMPT } from "@/lib/strategy/systemPrompt";

export type StrategyInputForLlm = Omit<StrategyInput, "firstName">;

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicMessageResponse = {
  content?: AnthropicContentBlock[];
  error?: { message?: string };
};

const MODEL = "claude-sonnet-4-5";
const API_URL = "https://api.anthropic.com/v1/messages";

const CORRECTIVE_SYSTEM_APPEND =
  "The prior assistant message in this conversation did not match the required StrategyOutput JSON schema. You must reply with ONLY one JSON object — no markdown code fences, no commentary. Every required field must be present; the disclaimers array must contain exactly the four verbatim strings specified in the main system prompt.";

const CORRECTIVE_USER_NUDGE =
  "Provide the corrected StrategyOutput JSON object now.";

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return key.trim();
}

function buildUserPayload(input: StrategyInputForLlm, archetype: Archetype): string {
  return JSON.stringify({
    archetype: {
      id: archetype.id,
      displayName: archetype.displayName,
      oneLiner: archetype.oneLiner,
      personality: archetype.personality,
      strategyTemplate: archetype.strategyTemplate,
      watchOuts: archetype.watchOuts,
    },
    sanitisedInput: input,
  });
}

function extractJsonObjectText(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence?.[1]) return fence[1].trim();
  return t;
}

function parseModelOutput(text: string): unknown {
  const jsonStr = extractJsonObjectText(text);
  return JSON.parse(jsonStr) as unknown;
}

async function callMessagesApi(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as AnthropicMessageResponse;

  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText;
    throw new Error(`Claude API error: ${msg}`);
  }

  const text = data.content?.[0]?.type === "text" ? data.content[0].text : undefined;
  if (!text?.trim()) {
    throw new Error("Claude returned an empty response");
  }
  return text;
}

/**
 * Calls Claude with prompt-cached system text; validates StrategyOutput; retries once on failure.
 */
export async function generateStrategy(
  input: StrategyInputForLlm,
  archetype: Archetype
): Promise<StrategyOutput> {
  const userContent = buildUserPayload(input, archetype);

  const baseBody = {
    model: MODEL,
    max_tokens: 4000,
    temperature: 0.4,
    system: [
      {
        type: "text",
        text: STRATEGY_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  };

  let text = await callMessagesApi(baseBody);

  let parsed: unknown;
  try {
    parsed = parseModelOutput(text);
  } catch {
    parsed = null;
  }

  let validated = parsed !== null ? parseStrategyOutputJson(parsed) : { ok: false as const };

  if (validated.ok) {
    return validated.output;
  }

  const retryBody = {
    ...baseBody,
    system: [
      {
        type: "text",
        text: STRATEGY_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: CORRECTIVE_SYSTEM_APPEND,
      },
    ],
    messages: [
      { role: "user", content: userContent },
      { role: "assistant", content: text },
      { role: "user", content: CORRECTIVE_USER_NUDGE },
    ],
  };

  text = await callMessagesApi(retryBody);

  try {
    parsed = parseModelOutput(text);
  } catch {
    throw new Error("Strategy generation failed: model returned invalid JSON after retry.");
  }

  validated = parseStrategyOutputJson(parsed);
  if (!validated.ok) {
    throw new Error("Strategy generation failed: output did not match StrategyOutput schema after retry.");
  }

  return validated.output;
}
