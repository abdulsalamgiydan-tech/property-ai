import { describe, expect, it } from "vitest";
import { csvCell } from "./csvSafety";

describe("csvCell — formula/CSV-injection safety (CWE-1236)", () => {
  it("neutralises a leading = (the classic Excel/Sheets formula trigger)", () => {
    expect(csvCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
  });

  it("neutralises a leading +, -, and @", () => {
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@SUM(1)")).toBe("'@SUM(1)");
  });

  it("neutralises a leading tab or carriage return used to smuggle a formula past naive checks", () => {
    expect(csvCell("\t=cmd|'/c calc'!A1")).toBe("'\t=cmd|'/c calc'!A1");
  });

  it("does not alter ordinary text that happens to contain but not start with a trigger char", () => {
    expect(csvCell("East Melbourne - VIC")).toBe("East Melbourne - VIC");
    expect(csvCell("a+b=c")).toBe("a+b=c");
  });

  it("still quotes values containing a comma, quote or newline, after the injection guard", () => {
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
    expect(csvCell('say "hi"')).toBe(`"say ""hi"""`);
  });

  it("renders null/undefined as an empty string, not the literal word", () => {
    expect(csvCell(null)).toBe("");
  });

  it("passes plain numbers through untouched, including negatives — a real JS number can never carry formula syntax", () => {
    expect(csvCell(1234)).toBe("1234");
    expect(csvCell(-5)).toBe("-5");
  });

  it("still guards a STRING that happens to look like a negative number but came from free text", () => {
    expect(csvCell("-5=EVIL()")).toBe("'-5=EVIL()");
  });
});
