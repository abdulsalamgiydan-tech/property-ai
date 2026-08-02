import { afterEach, describe, expect, it } from "vitest";
import { getStashConfig, isStashEnabled } from "./env";

const KEYS = ["STASH_ENABLED", "STASH_API_BASE_URL", "STASH_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function set(k: (typeof KEYS)[number], v: string | undefined) {
  if (!(k in saved)) saved[k] = process.env[k];
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

describe("stash env gate", () => {
  it("is disabled with no configuration (the current repo state)", () => {
    set("STASH_ENABLED", undefined);
    set("STASH_API_BASE_URL", undefined);
    set("STASH_API_KEY", undefined);
    expect(getStashConfig()).toBeNull();
    expect(isStashEnabled()).toBe(false);
  });

  it("stays disabled when the flag is on but credentials are missing", () => {
    set("STASH_ENABLED", "true");
    set("STASH_API_BASE_URL", undefined);
    set("STASH_API_KEY", undefined);
    expect(isStashEnabled()).toBe(false);
  });

  it("stays disabled when credentials exist but the flag is off", () => {
    set("STASH_ENABLED", undefined);
    set("STASH_API_BASE_URL", "https://stash.example");
    set("STASH_API_KEY", "k");
    expect(getStashConfig()).not.toBeNull();
    expect(isStashEnabled()).toBe(false);
  });

  it("is enabled only when both the flag and full credentials are present", () => {
    set("STASH_ENABLED", "true");
    set("STASH_API_BASE_URL", "https://stash.example/");
    set("STASH_API_KEY", "k");
    expect(isStashEnabled()).toBe(true);
    expect(getStashConfig()?.baseUrl).toBe("https://stash.example"); // trailing slash trimmed
  });
});
