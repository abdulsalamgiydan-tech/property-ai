// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEvent = vi.fn();
vi.mock("@/lib/analytics/events", () => ({ trackEvent: (event: unknown) => trackEvent(event) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { BuyBoxRequiredCard } from "./BuyBoxRequiredCard";

describe("BuyBoxRequiredCard", () => {
  afterEach(cleanup);

  beforeEach(() => trackEvent.mockReset());

  it("gives a clear route to create a buy box", () => {
    render(<BuyBoxRequiredCard surface="byod" />);
    expect(screen.getByRole("link", { name: "Create my buy box" }).getAttribute("href")).toBe("/find-investment");
    expect(screen.getByText(/Return here/)).toBeTruthy();
  });

  it("records only the categorical surface when shown", () => {
    render(<BuyBoxRequiredCard surface="deal_hunter" />);
    expect(trackEvent).toHaveBeenCalledWith({ name: "founding_beta_buy_box_required", surface: "deal_hunter" });
  });
});
