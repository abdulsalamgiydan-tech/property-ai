import { z } from "zod";

export const feedbackCategories = ["bug", "feature_request", "general", "other"] as const;

export const feedbackSubmissionSchema = z.object({
  category: z.enum(feedbackCategories),
  message: z.string().trim().min(1).max(1000),
  pagePath: z.string().trim().max(300).optional(),
  satisfactionScore: z.number().int().min(1).max(5).nullable().optional(),
  contactPermission: z.boolean().default(false),
  clientSubmissionId: z.string().trim().min(8).max(80).optional(),
});

export type FeedbackCategory = (typeof feedbackCategories)[number];
export type FeedbackSubmission = z.output<typeof feedbackSubmissionSchema>;

export function safeFeedbackPath(path: string | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  return path.slice(0, 300);
}
