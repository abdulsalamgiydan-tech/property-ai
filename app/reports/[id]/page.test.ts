import { describe, expect, it } from "vitest";

import { SavedReportClient } from "@/components/reports/SavedReportClient";
import SavedReportPage from "./page";

describe("SavedReportPage", () => {
  it("passes the resolved route id to the saved report client", async () => {
    const reportId = "report-123";

    const page = await SavedReportPage({
      params: Promise.resolve({ id: reportId }),
    });

    expect(page.type).toBe(SavedReportClient);
    expect(page.props.reportId).toBe(reportId);
  });
});
