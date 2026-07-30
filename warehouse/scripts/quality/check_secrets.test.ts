import { describe, expect, it } from "vitest";
import { scanText, SECRET_PATTERNS } from "./check_secrets.mjs";

// Fixture "secrets" are built by concatenation, never as a single literal
// token, so this test file itself never contains a real matchable secret
// shape when the real script later scans git-tracked source.
const fakeAwsKey = "AKIA" + "A".repeat(16);
const fakeProviderKey = "sk-" + "a".repeat(24);
const fakeJwt = "eyJ" + "a".repeat(15) + "." + "eyJ" + "a".repeat(15) + "." + "b".repeat(15);
const fakePemHeader = "-----BEGIN " + "RSA PRIVATE KEY-----";

describe("SECRET_PATTERNS", () => {
  it("declares the four documented shapes", () => {
    expect(SECRET_PATTERNS.map((p) => p.name)).toEqual([
      "AWS access key",
      "Provider API key (sk-...)",
      "JWT-shaped token",
      "PEM private key header",
    ]);
  });
});

describe("scanText", () => {
  it("flags an AWS-shaped access key", () => {
    const findings = scanText(`const key = "${fakeAwsKey}";`);
    expect(findings).toHaveLength(1);
    expect(findings[0].name).toBe("AWS access key");
  });

  it("flags a provider sk- style key", () => {
    const findings = scanText(`ANTHROPIC_API_KEY=${fakeProviderKey}`);
    expect(findings.some((f) => f.name === "Provider API key (sk-...)")).toBe(true);
  });

  it("flags a JWT-shaped token", () => {
    const findings = scanText(`token: "${fakeJwt}"`);
    expect(findings.some((f) => f.name === "JWT-shaped token")).toBe(true);
  });

  it("flags a PEM private key header", () => {
    const findings = scanText(fakePemHeader);
    expect(findings.some((f) => f.name === "PEM private key header")).toBe(true);
  });

  it("never includes the raw matched value, only a redacted form", () => {
    const findings = scanText(`const key = "${fakeAwsKey}";`);
    for (const f of findings) {
      expect(f.redacted).not.toContain(fakeAwsKey);
      expect(f.redacted).toContain("redacted");
    }
  });

  it("does not flag documented .env.example placeholders", () => {
    const findings = scanText([
      "ANTHROPIC_API_KEY=sk-ant-...",
      "SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Supabase Dashboard -> Settings -> API -> service_role key)",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key",
    ].join("\n"));
    expect(findings).toHaveLength(0);
  });

  it("does not flag NEXT_PUBLIC_* or WAREHOUSE_SUPABASE_ANON_KEY lines regardless of shape, by key-name allowlist", () => {
    const findings = scanText([
      `NEXT_PUBLIC_SOMETHING=${fakeJwt}`,
      `WAREHOUSE_SUPABASE_ANON_KEY=${fakeJwt}`,
    ].join("\n"));
    expect(findings).toHaveLength(0);
  });

  it("skips a value explicitly passed as an allowed value, regardless of key name", () => {
    const findings = scanText(`SOME_OTHER_KEY=${fakeJwt}`, { allowedValues: new Set([fakeJwt]) });
    expect(findings).toHaveLength(0);
  });

  it("still flags a non-allow-listed key with a real-shaped secret", () => {
    const findings = scanText(`SOME_RANDOM_SECRET=${fakeAwsKey}`);
    expect(findings).toHaveLength(1);
  });
});
