/**
 * Internal product-analytics event contract (Sprint 13 WS17). No
 * third-party tracker, no invasive session recording — per the guardrail,
 * this is a typed event contract plus a development-mode console logger
 * only. There is no approved analytics provider for this project yet;
 * trackEvent() is the single seam a future approved provider would be
 * wired into, so call sites never need to change when that happens.
 *
 * Never logs PII beyond what the event name itself implies (a geography
 * name/code is not personal data); never logs raw form input, tokens, or
 * anything from an auth session.
 */

export type AnalyticsEvent =
  | { name: "search_performed"; query: string; resultCount: number }
  | { name: "profile_opened"; geographyType: "suburb" | "postcode"; geographyCode: string }
  | { name: "comparison_created"; geographyCount: number }
  | { name: "scenario_calculated"; geographyCode: string; caseCount: number }
  | { name: "metric_explanation_opened"; metricFamily: string }
  | { name: "area_saved"; geographyType: "suburb" | "postcode" | null }
  | { name: "export_generated"; exportType: "csv" | "json" | "print"; surface: string }
  | { name: "error_encountered"; surface: string; errorKind: string }
  | { name: "research_copilot_answered"; geographyCode: string; grounded: boolean }
  | { name: "feedback_submitted"; category: string };

/**
 * Development-mode logger only. In production this is intentionally a
 * no-op until an approved analytics provider exists — see the guardrail
 * against adding invasive tracking without explicit approval. Wrapping
 * every call site in this one function means enabling a real provider
 * later is a one-line change here, not a codebase-wide rewrite.
 */
export function trackEvent(event: AnalyticsEvent): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event.name, event);
  }
}
