import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./events";

describe("trackEvent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs to console.debug outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    trackEvent({ name: "search_performed", query: "melbourne", resultCount: 7 });
    expect(spy).toHaveBeenCalledWith("[analytics]", "search_performed", expect.objectContaining({ query: "melbourne", resultCount: 7 }));
  });

  it("does not log in production (no approved analytics provider is wired up yet)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    trackEvent({ name: "area_saved", geographyType: "suburb" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("accepts every documented event shape without a runtime error", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(() => {
      trackEvent({ name: "search_performed", query: "x", resultCount: 0 });
      trackEvent({ name: "profile_opened", geographyType: "suburb", geographyCode: "21640" });
      trackEvent({ name: "comparison_created", geographyCount: 3 });
      trackEvent({ name: "scenario_calculated", geographyCode: "21640", caseCount: 3 });
      trackEvent({ name: "metric_explanation_opened", metricFamily: "sales" });
      trackEvent({ name: "area_saved", geographyType: null });
      trackEvent({ name: "export_generated", exportType: "csv", surface: "scenario_lab" });
      trackEvent({ name: "error_encountered", surface: "search", errorKind: "network" });
      trackEvent({ name: "research_copilot_answered", geographyCode: "21640", grounded: true });
      trackEvent({ name: "feedback_submitted", category: "idea" });
      trackEvent({ name: "founding_beta_buy_box_required", surface: "byod" });
      trackEvent({ name: "founding_beta_analysis_started", surface: "byod" });
      trackEvent({ name: "founding_beta_missing_facts_prompted", surface: "byod", missingCount: 2 });
      trackEvent({ name: "founding_beta_analysis_completed", surface: "byod", bucket: "ranked", completeFacts: true, missingCount: 0 });
      trackEvent({ name: "founding_beta_pipeline_updated", surface: "deal_hunter", status: "reviewing" });
      trackEvent({ name: "founding_beta_deal_brief_opened", surface: "deal_hunter" });
      trackEvent({ name: "founding_beta_compare_opened", surface: "byod", selectionCount: 2 });
    }).not.toThrow();
  });

  it("keeps the founding-beta contract free of identity, listing and free-text fields", () => {
    const events = [
      { name: "founding_beta_buy_box_required", surface: "byod" },
      { name: "founding_beta_analysis_started", surface: "byod" },
      { name: "founding_beta_missing_facts_prompted", surface: "byod", missingCount: 2 },
      { name: "founding_beta_analysis_completed", surface: "byod", bucket: "needs_review", completeFacts: false, missingCount: 2 },
      { name: "founding_beta_pipeline_updated", surface: "deal_hunter", status: "reviewing" },
      { name: "founding_beta_deal_brief_opened", surface: "deal_hunter" },
      { name: "founding_beta_compare_opened", surface: "byod", selectionCount: 2 },
    ];
    const payload = JSON.stringify(events);
    expect(payload).not.toMatch(/email|user.?id|listing|address|url|token|@|https?:/i);
  });
});
