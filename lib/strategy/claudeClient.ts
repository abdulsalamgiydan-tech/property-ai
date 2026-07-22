import "server-only";

import type { Archetype } from "@/lib/strategy/archetypes";
import { strategyOutputSchema, type StrategyOutput } from "@/lib/strategy/strategyOutput";
import type { StrategyInput } from "@/lib/strategy/strategyInput";
import { STRATEGY_SYSTEM_PROMPT } from "@/lib/strategy/systemPrompt";
import { z } from "zod";

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

function parseValidateStrategyOutput(responseText: string): StrategyOutput {
  const jsonStr = extractJsonObjectText(responseText);
  try {
    const parsed = JSON.parse(jsonStr);
    const validated = strategyOutputSchema.parse(parsed);
    return validated;
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error("[claude] Zod validation errors:", JSON.stringify(err.issues, null, 2));
    }
    throw err;
  }
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
    max_tokens: 8000,
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

  try {
    return parseValidateStrategyOutput(text);
  } catch {
    /* first attempt failed — retry */
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
    return parseValidateStrategyOutput(text);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error("Strategy generation failed: output did not match StrategyOutput schema after retry.");
    }
    throw new Error("Strategy generation failed: model returned invalid JSON after retry.");
  }
}
