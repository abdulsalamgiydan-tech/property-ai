import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { selectArchetype } from "@/lib/strategy/archetypes";
import { generateStrategy, type StrategyInputForLlm } from "@/lib/strategy/claudeClient";
import { parseStrategyInput, type StrategyInput } from "@/lib/strategy/strategyInput";
import type { StrategyOutput } from "@/lib/strategy/strategyOutput";
import {
  countRecentGenerations,
  recordGeneration,
  retryAfterDaysForRateLimit,
  STRATEGY_FREE_TIER_LIMIT,
} from "@/lib/strategy/rateLimit";
import { sanitiseUserText } from "@/lib/strategy/sanitiseUserText";
import { NextResponse } from "next/server";

function buildLlmInput(
  input: StrategyInput,
  successVision: string,
  primaryConcern: string,
  additionalContext: string
): StrategyInputForLlm {
  const rest = { ...input };
  delete rest.firstName;
  return {
    ...rest,
    successVision,
    primaryConcern,
    additionalContext,
  };
}

export async function POST(req: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = parseStrategyInput(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "validation_error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.input;

    const recentCount = await countRecentGenerations(user.id, supabase);
    if (recentCount >= STRATEGY_FREE_TIER_LIMIT) {
      const retry_after_days = await retryAfterDaysForRateLimit(user.id, supabase);
      return NextResponse.json(
        { error: "rate_limit", retry_after_days },
        { status: 429 }
      );
    }

    const sv = sanitiseUserText(input.successVision);
    const pc = sanitiseUserText(input.primaryConcern);
    const ac = sanitiseUserText(input.additionalContext);
    const sanitisationFlag = sv.flagged || pc.flagged || ac.flagged;

    const { archetype } = selectArchetype(input);

    await recordGeneration(user.id, sanitisationFlag, supabase);

    const llmInput = buildLlmInput(input, sv.cleaned, pc.cleaned, ac.cleaned);

    let output: StrategyOutput;
    try {
      output = await generateStrategy(llmInput, archetype);
    } catch (e) {
      console.error("[strategy/generate] Claude generation failed:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "generation_failed" }, { status: 502 });
    }

    output = {
      ...output,
      archetype_id: archetype.id,
      archetype_display_name: archetype.displayName,
      archetype_one_liner: archetype.oneLiner,
    };

    const { error: insertError } = await supabase.from("strategy_reports").insert({
      user_id: user.id,
      archetype_id: output.archetype_id,
      archetype_display_name: output.archetype_display_name,
      input_json: input,
      output_json: output,
    });

    if (insertError) {
      console.error("[strategy/generate] Persist failed:", insertError.message);
      return NextResponse.json({ error: "persist_failed" }, { status: 500 });
    }

    return NextResponse.json(output);
  } catch (e) {
    console.error("[strategy/generate] Unexpected error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
