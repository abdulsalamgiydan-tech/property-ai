import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalFetch = globalThis.fetch;

describe("answerResearchQuestion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    globalThis.fetch = originalFetch;
  });

  it("sends provider requests server-side with an abort signal and bounded output", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const body = JSON.parse(String(init?.body));
      expect(body.max_tokens).toBeLessThanOrEqual(500);
      expect(body.messages[0].content).toBe("What is known?");
      return new Response(JSON.stringify({ content: [{ type: "text", text: "Only recorded data is available." }] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { answerResearchQuestion } = await import("./copilotClient");
    const result = await answerResearchQuestion("- Median sale price: Not recorded", "What is known?");

    expect(result.answerText).toBe("Only recorded data is available.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when the provider returns an empty answer", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "   " }] }), { status: 200 })) as typeof fetch;

    const { answerResearchQuestion } = await import("./copilotClient");
    await expect(answerResearchQuestion("- Median sale price: Not recorded", "What is known?")).rejects.toThrow("empty response");
  });

  it("aborts and rejects rather than hanging when the provider does not respond within the 15s timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    globalThis.fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    ) as typeof fetch;

    const { answerResearchQuestion } = await import("./copilotClient");
    const promise = answerResearchQuestion("- Median sale price: Not recorded", "What is known?");
    const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    vi.useRealTimers();
  });
});