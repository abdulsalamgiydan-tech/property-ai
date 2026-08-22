import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// Keep the test hermetic: the homepage only needs its element tree inspected,
// not rendered, so stub the leaf imports rather than pull in next/link's client
// runtime or the font/logo modules.
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => props }));
vi.mock("@/components/design/LogoMark", () => ({ LogoMark: () => null }));
vi.mock("@/components/home/HomeAccountCTA", () => ({ HomeAccountCTA: () => null }));

import HomePage from "./page";

/** Collects every `href` prop found anywhere in a React element tree. */
function collectHrefs(node: unknown, acc: string[] = []): string[] {
  if (node == null || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => collectHrefs(child, acc));
    return acc;
  }
  const el = node as Partial<ReactElement> & { props?: Record<string, unknown> };
  const props = el.props;
  if (props) {
    if (typeof props.href === "string") acc.push(props.href);
    if ("children" in props) collectHrefs(props.children, acc);
  }
  return acc;
}

describe("HomePage tools", () => {
  it("never links to the legacy /suburb-intelligence page", () => {
    const hrefs = collectHrefs(HomePage());
    expect(hrefs).not.toContain("/suburb-intelligence");
  });

  it("still surfaces the core public tools", () => {
    const hrefs = collectHrefs(HomePage());
    for (const href of ["/analyse-property", "/strategy", "/compare-properties", "/portfolio"]) {
      expect(hrefs).toContain(href);
    }
  });
});
