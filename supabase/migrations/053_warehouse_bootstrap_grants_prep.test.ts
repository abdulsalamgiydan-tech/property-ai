import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("053_warehouse_bootstrap_grants_prep.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "053_warehouse_bootstrap_grants_prep.sql"), "utf8");
  const lower = sql.toLowerCase();

  it("does not drop, truncate, or write data", () => {
    expect(lower).not.toMatch(/^\s*drop\s+(table|view|function|schema)/im);
    expect(lower).not.toMatch(/^\s*truncate\s+/im);
    expect(lower).not.toMatch(/^\s*delete\s+from\s+/im);
    expect(lower).not.toMatch(/^\s*insert\s+into\s+/im);
  });

  it("revokes core/mart/meta schema usage from anon and authenticated before 046 runs", () => {
    expect(lower).toContain("revoke all on schema core, mart, meta from anon, authenticated");
  });

  it("grants service_role only usage + select/insert/update, never delete or truncate on the warehouse schemas", () => {
    expect(lower).toContain("grant usage on schema core, mart, meta to service_role");
    expect(lower).toContain("grant select, insert, update on all tables in schema core, mart, meta to service_role");
    expect(lower).not.toMatch(/grant[^;]*delete[^;]*to service_role/);
  });

  it("never grants anon or authenticated anything on these schemas", () => {
    expect(lower).not.toMatch(/grant[^;]*to anon/);
    expect(lower).not.toMatch(/grant[^;]*to authenticated\b(?!,)/);
  });
});
