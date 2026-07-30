import { describe, expect, it } from "vitest";
import { feedbackCategories, feedbackSubmissionSchema, safeFeedbackPath } from "./schema";

describe("feedback schema", () => {
  it("includes idea as a valid category", () => {
    expect(feedbackCategories).toContain("idea");
    expect(feedbackSubmissionSchema.safeParse({ category: "idea", message: "Add a dark mode toggle." }).success).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(feedbackSubmissionSchema.safeParse({ category: "suggestion", message: "Hello" }).success).toBe(false);
  });

  it("accepts a valid submission", () => {
    const parsed = feedbackSubmissionSchema.parse({
      category: "bug",
      message: "The comparison page did not load.",
      pagePath: "/compare-properties",
      satisfactionScore: 3,
      contactPermission: true,
      clientSubmissionId: "submission-123",
    });

    expect(parsed.category).toBe("bug");
    expect(parsed.contactPermission).toBe(true);
  });

  it("rejects empty or oversized feedback", () => {
    expect(feedbackSubmissionSchema.safeParse({ category: "general", message: "" }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ category: "general", message: "x".repeat(1001) }).success).toBe(false);
  });

  it("allows only internal paths for context", () => {
    expect(safeFeedbackPath("/dashboard")).toBe("/dashboard");
    expect(safeFeedbackPath("https://example.com")).toBeNull();
    expect(safeFeedbackPath("//example.com")).toBeNull();
  });
});
