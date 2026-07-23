import { describe, expect, it } from "vitest";
import { buildDigestPreview, normaliseDigestFrequency, type DigestableEvent } from "./digestPreview";

function event(overrides: Partial<DigestableEvent> = {}): DigestableEvent {
  return {
    id: "evt-1",
    description: "Median sale price rose 5.0%",
    metric_family: "sales",
    created_at: "2026-07-20T00:00:00.000Z",
    read: false,
    ...overrides,
  };
}

describe("normaliseDigestFrequency", () => {
  it("accepts the three documented values", () => {
    expect(normaliseDigestFrequency("off")).toBe("off");
    expect(normaliseDigestFrequency("daily")).toBe("daily");
    expect(normaliseDigestFrequency("weekly")).toBe("weekly");
  });

  it("falls back to 'off' for null, undefined, or an unrecognised value — never sends by default", () => {
    expect(normaliseDigestFrequency(null)).toBe("off");
    expect(normaliseDigestFrequency(undefined)).toBe("off");
    expect(normaliseDigestFrequency("hourly-spam-me")).toBe("off");
  });
});

describe("buildDigestPreview", () => {
  it("only includes unread events — a digest is 'what's new', not a full history", () => {
    const events = [event({ id: "1", read: false }), event({ id: "2", read: true })];
    const preview = buildDigestPreview(events, "weekly");
    expect(preview.eventCount).toBe(1);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].description).toBe(events[0].description);
  });

  it("produces a clear 'nothing new' preview when there are no unread events, rather than an empty/broken state", () => {
    const preview = buildDigestPreview([], "daily");
    expect(preview.eventCount).toBe(0);
    expect(preview.subject).toBe("No changes to report");
    expect(preview.summaryLine).toContain("Nothing new");
  });

  it("still builds a preview when frequency is 'off' — lets a user see the value before opting in", () => {
    const events = [event()];
    const preview = buildDigestPreview(events, "off");
    expect(preview.eventCount).toBe(1);
    expect(preview.frequency).toBe("off");
  });

  it("caps the item list at 20 even with many unread events — a digest is a summary, not a dump", () => {
    const events = Array.from({ length: 50 }, (_, i) => event({ id: `evt-${i}` }));
    const preview = buildDigestPreview(events, "weekly");
    expect(preview.eventCount).toBe(50); // count reflects the real total
    expect(preview.items).toHaveLength(20); // but the rendered list is capped
  });

  it("pluralises the subject/summary correctly for exactly one event", () => {
    const preview = buildDigestPreview([event()], "daily");
    expect(preview.subject).toBe("1 update on your watchlist");
    expect(preview.summaryLine).toContain("1 change detected");
  });
});
