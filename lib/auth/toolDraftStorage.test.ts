import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAnalyseDraft, loadCompareDraft } from "./toolDraftStorage";

describe("tool draft storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["Analyse", loadAnalyseDraft],
    ["Compare", loadCompareDraft],
  ])("returns no %s draft when storage reads are denied", (_, loadDraft) => {
    const getItem = vi.fn(() => {
      throw new DOMException("Access denied", "SecurityError");
    });

    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem });

    expect(loadDraft()).toBeNull();
    expect(getItem).toHaveBeenCalledOnce();
  });
});
