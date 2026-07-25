/**
 * Digest preview (Sprint 14 WS9) — a provider-neutral, dry-run-only
 * preview of what a future email/push digest WOULD contain, built from
 * a user's own unread watchlist change events. Nothing here ever sends
 * anything: no email client, no push provider, no external call of any
 * kind — this is purely a formatting/grouping function rendered inline
 * in the product, per the guardrail against real notifications without
 * explicit approval.
 */

export type DigestFrequency = "off" | "daily" | "weekly";

export type DigestableEvent = {
  id: string;
  description: string;
  metric_family: string;
  created_at: string;
  read: boolean;
};

export type DigestPreview = {
  frequency: DigestFrequency;
  subject: string;
  eventCount: number;
  summaryLine: string;
  items: { description: string; metricFamily: string; createdAt: string }[];
};

const VALID_FREQUENCIES: DigestFrequency[] = ["off", "daily", "weekly"];

export function normaliseDigestFrequency(value: string | null | undefined): DigestFrequency {
  return VALID_FREQUENCIES.includes(value as DigestFrequency) ? (value as DigestFrequency) : "off";
}

/**
 * Builds a preview from a user's own unread events only (read events
 * don't belong in a "what's new" digest). Returns a preview even when
 * frequency is "off" — the point is to let a user see what they'd get
 * *before* opting in, not to hide the feature until it's enabled.
 */
export function buildDigestPreview(events: DigestableEvent[], frequency: DigestFrequency): DigestPreview {
  const unread = events.filter((e) => !e.read);
  const period = frequency === "daily" ? "today" : frequency === "weekly" ? "this week" : "since you last checked";

  return {
    frequency,
    subject:
      unread.length === 0
        ? "No changes to report"
        : `${unread.length} update${unread.length === 1 ? "" : "s"} on your watchlist`,
    eventCount: unread.length,
    summaryLine:
      unread.length === 0
        ? `Nothing new ${period}.`
        : `${unread.length} change${unread.length === 1 ? "" : "s"} detected ${period} across your watched areas.`,
    items: unread
      .slice(0, 20) // a digest is a summary, not a full export — cap it
      .map((e) => ({ description: e.description, metricFamily: e.metric_family, createdAt: e.created_at })),
  };
}
