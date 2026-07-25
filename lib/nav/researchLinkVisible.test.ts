import { describe, expect, it } from "vitest";
import { shouldShowResearchNav } from "./researchLinkVisible";

describe("shouldShowResearchNav", () => {
  it("hides the Research nav entry when the warehouse preview flag is off", () => {
    expect(shouldShowResearchNav(false)).toBe(false);
  });
  it("shows the Research nav entry when the warehouse preview flag is on", () => {
    expect(shouldShowResearchNav(true)).toBe(true);
  });
});
