import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TABLE_ALLOW_LIST,
  COLUMN_EXCLUDE_LIST,
  PROD_REF,
  BRANCH_REF,
  assertNotProduction,
  describeTarget,
  describeHost,
  resolveTarget,
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

describe("COLUMN_EXCLUDE_LIST", () => {
  it("excludes exactly geom and unique_signature, both for a documented reason", () => {
    expect(COLUMN_EXCLUDE_LIST["core.dim_geography"]).toEqual(["geom"]);
    expect(COLUMN_EXCLUDE_LIST["meta.data_incident"]).toEqual(["unique_signature"]);
    expect(Object.keys(COLUMN_EXCLUDE_LIST)).toHaveLength(2);
  });
});

describe("describeHost", () => {
  it("identifies a Production-referencing host without needing a full URL", () => {
    expect(describeHost(`db.${PROD_REF}.supabase.co`).knownRef).toBe("PRODUCTION");
  });

  it("never includes a password in its output (there is none to leak)", () => {
    const { maskedUrl } = describeHost("db.example.supabase.co");
    expect(maskedUrl).toBe("postgresql://***@db.example.supabase.co/***");
  });

  it("labels an unrecognized host as unknown/local", () => {
    expect(describeHost("localhost").knownRef).toBe("unknown/local");
  });
});

describe("resolveTarget", () => {
  const PG_VARS = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
  afterEach(() => {
    for (const v of PG_VARS) delete process.env[v];
  });

  it("--target-pg-env requires PGHOST to be set", () => {
    expect(() => resolveTarget({ "target-pg-env": true })).toThrow(/PGHOST/);
  });

  it("--target-pg-env requires PGPASSWORD to be set", () => {
    process.env.PGHOST = "db.example.supabase.co";
    expect(() => resolveTarget({ "target-pg-env": true })).toThrow(/PGPASSWORD/);
  });

  it("--target-pg-env refuses the Production host", () => {
    process.env.PGHOST = `db.${PROD_REF}.supabase.co`;
    process.env.PGPASSWORD = "irrelevant";
    expect(() => resolveTarget({ "target-pg-env": true })).toThrow(/Refusing to target Production/);
  });

  it("--target-pg-env builds a config object, never a connection-string URL, from PG* env vars", () => {
    process.env.PGHOST = "db.example.supabase.co";
    process.env.PGPORT = "6543";
    process.env.PGUSER = "myuser";
    process.env.PGPASSWORD = "hunter2";
    process.env.PGDATABASE = "mydb";
    const { clientConfig, targetInfo } = resolveTarget({ "target-pg-env": true });
    expect(clientConfig).toEqual({
      host: "db.example.supabase.co",
      port: 6543,
      user: "myuser",
      password: "hunter2",
      database: "mydb",
    });
    expect(targetInfo.knownRef).toBe("unknown/local");
  });

  it("--target-pg-env defaults port/user/database when unset", () => {
    process.env.PGHOST = "db.example.supabase.co";
    process.env.PGPASSWORD = "hunter2";
    const { clientConfig } = resolveTarget({ "target-pg-env": true });
    expect(clientConfig.port).toBe(5432);
    expect(clientConfig.user).toBe("postgres");
    expect(clientConfig.database).toBe("postgres");
  });

  it("falls back to --target-url-env when --target-pg-env is not given", () => {
    process.env.MY_TEST_URL = `postgres://u:p@localhost:5432/${BRANCH_REF}`;
    try {
      const { clientConfig, targetInfo } = resolveTarget({ "target-url-env": "MY_TEST_URL" });
      expect(clientConfig).toEqual({ connectionString: process.env.MY_TEST_URL });
      expect(targetInfo.knownRef).toBe("warehouse-validation");
    } finally {
      delete process.env.MY_TEST_URL;
    }
  });

  it("throws when neither --target-pg-env nor --target-url-env is given", () => {
    expect(() => resolveTarget({})).toThrow(/--target-url-env.*or --target-pg-env/);
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
