import { describe, expect, it } from "vitest";
import { buildDesktopNavLinks, shouldShowResearchNav } from "./researchLinkVisible";

describe("shouldShowResearchNav", () => {
  it("hides the Research nav entry when the warehouse preview flag is off", () => {
    expect(shouldShowResearchNav(false)).toBe(false);
  });
  it("shows the Research nav entry when the warehouse preview flag is on", () => {
    expect(shouldShowResearchNav(true)).toBe(true);
  });
});

describe("buildDesktopNavLinks", () => {
  const publicLinks = [
    { href: "/", label: "Home" },
    { href: "/analyse-property", label: "Analyse" },
  ];
  const researchLink = { href: "/research", label: "Research" };
  const suburbIntelligenceLink = { href: "/suburb-intelligence", label: "Suburb intelligence" };

  it("excludes both Research and Suburb Intelligence when the warehouse preview flag is off (Production today)", () => {
    const links = buildDesktopNavLinks(false, publicLinks, researchLink, suburbIntelligenceLink);
    expect(links.map((l) => l.href)).toEqual(["/", "/analyse-property"]);
  });

  it("includes both Research and Suburb Intelligence when the warehouse preview flag is on (Preview)", () => {
    const links = buildDesktopNavLinks(true, publicLinks, researchLink, suburbIntelligenceLink);
    expect(links.map((l) => l.href)).toEqual(["/", "/research", "/analyse-property", "/suburb-intelligence"]);
  });
});
