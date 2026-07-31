import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TABLE_ALLOW_LIST,
  PROD_REF,
  BRANCH_REF,
  assertNotProduction,
  describeTarget,
  resolveTables,
  parseArgs,
  targetKey,
} from "./lib.mjs";

describe("TABLE_ALLOW_LIST", () => {
  it("contains exactly the 21-table minimum launch contract", () => {
    expect(TABLE_ALLOW_LIST).toHaveLength(21);
    expect(TABLE_ALLOW_LIST).toContain("core.dim_geography");
    expect(TABLE_ALLOW_LIST.filter((t) => t.startsWith("core."))).toHaveLength(1);
    expect(TABLE_ALLOW_LIST.filter((t) => t.startsWith("mart."))).toHaveLength(9);
    expect(TABLE_ALLOW_LIST.filter((t) => t.startsWith("meta."))).toHaveLength(11);
    expect(TABLE_ALLOW_LIST.some((t) => t.startsWith("staging."))).toBe(false);
  });

  it("has no duplicate entries", () => {
    expect(new Set(TABLE_ALLOW_LIST).size).toBe(TABLE_ALLOW_LIST.length);
  });
});

describe("assertNotProduction", () => {
  it("throws if no url is given", () => {
    expect(() => assertNotProduction("")).toThrow("connection string is required");
  });

  it("does not throw for a non-Production url", () => {
    expect(() => assertNotProduction(`postgres://user:pass@localhost:5432/${BRANCH_REF}`)).not.toThrow();
  });

  it("throws for a Production-referencing url with no override at all", () => {
    expect(() => assertNotProduction(`postgres://user:pass@db.${PROD_REF}.supabase.co:5432/postgres`)).toThrow(/Refusing to target Production/);
  });

  describe("with SNAPSHOT_ALLOW_PRODUCTION_TARGET env var set", () => {
    const prodUrl = `postgres://user:pass@db.${PROD_REF}.supabase.co:5432/postgres`;
    beforeEach(() => {
      process.env.SNAPSHOT_ALLOW_PRODUCTION_TARGET = "true";
    });
    afterEach(() => {
      delete process.env.SNAPSHOT_ALLOW_PRODUCTION_TARGET;
    });

    it("still throws without the CLI acknowledgement -- single opt-in is never enough", () => {
      expect(() => assertNotProduction(prodUrl, { cliAcknowledged: false })).toThrow(/Refusing to target Production/);
    });

    it("passes only when both the CLI flag and the env var are set together", () => {
      expect(() => assertNotProduction(prodUrl, { cliAcknowledged: true })).not.toThrow();
    });
  });

  it("throws with only the CLI flag and no env var -- single opt-in is never enough", () => {
    const prodUrl = `postgres://user:pass@db.${PROD_REF}.supabase.co:5432/postgres`;
    expect(() => assertNotProduction(prodUrl, { cliAcknowledged: true })).toThrow(/Refusing to target Production/);
  });
});

describe("describeTarget", () => {
  it("masks the password portion of the connection string", () => {
    const { maskedUrl } = describeTarget("postgres://myuser:supersecret@localhost:5432/db");
    expect(maskedUrl).not.toContain("supersecret");
    expect(maskedUrl).toContain("myuser:***@");
  });

  it("identifies a Production-referencing host", () => {
    const { knownRef } = describeTarget(`postgres://u:p@db.${PROD_REF}.supabase.co:5432/postgres`);
    expect(knownRef).toBe("PRODUCTION");
  });

  it("identifies a warehouse-validation-referencing host", () => {
    const { knownRef } = describeTarget(`postgres://u:p@db.${BRANCH_REF}.supabase.co:5432/postgres`);
    expect(knownRef).toBe("warehouse-validation");
  });

  it("labels an unrecognized host as unknown/local", () => {
    const { knownRef } = describeTarget("postgres://u:p@localhost:5432/db");
    expect(knownRef).toBe("unknown/local");
  });
});

describe("resolveTables", () => {
  it("returns the full allow-list when nothing is supplied", () => {
    expect(resolveTables(undefined)).toEqual(TABLE_ALLOW_LIST);
    expect(resolveTables([])).toEqual(TABLE_ALLOW_LIST);
  });

  it("accepts a valid subset", () => {
    expect(resolveTables(["core.dim_geography"])).toEqual(["core.dim_geography"]);
  });

  it("rejects any table not in the allow-list", () => {
    expect(() => resolveTables(["public.user_feedback"])).toThrow(/not in the allow-list/);
  });
});

describe("parseArgs", () => {
  it("parses --key=value flags", () => {
    expect(parseArgs(["--snapshot-id=abc", "--force"])).toMatchObject({ "snapshot-id": "abc", force: true });
  });

  it("collects positional args separately", () => {
    expect(parseArgs(["positional", "--flag"])._).toEqual(["positional"]);
  });
});

describe("targetKey", () => {
  it("is deterministic for the same host", () => {
    const a = targetKey("postgres://u:p@localhost:5432/db1");
    const b = targetKey("postgres://u2:p2@localhost:5432/db2");
    expect(a).toBe(b);
  });

  it("differs for different hosts", () => {
    const a = targetKey("postgres://u:p@localhost:5432/db");
    const b = targetKey("postgres://u:p@example.com:5432/db");
    expect(a).not.toBe(b);
  });
});
