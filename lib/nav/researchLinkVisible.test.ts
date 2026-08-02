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

  it("shows only the public links when the warehouse preview flag is off (Production today)", () => {
    const links = buildDesktopNavLinks(false, publicLinks, researchLink);
    expect(links.map((l) => l.href)).toEqual(["/", "/analyse-property"]);
  });

  it("inserts Research after Home when the warehouse preview flag is on, and never Suburb Intelligence", () => {
    const links = buildDesktopNavLinks(true, publicLinks, researchLink);
    expect(links.map((l) => l.href)).toEqual(["/", "/research", "/analyse-property"]);
    expect(links.some((l) => l.href === "/suburb-intelligence")).toBe(false);
  });
});
