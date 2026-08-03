/**
 * Whether the primary nav should show the Research entry point. Kept as a
 * standalone pure function (rather than inlined in the client Navbar) so
 * the gating logic is unit-testable without mounting a component or
 * mocking auth/router context.
 */
export function shouldShowResearchNav(warehousePreviewEnabled: boolean): boolean {
  return warehousePreviewEnabled;
}

export type NavLink = { href: string; label: string };

/**
 * Builds the desktop primary-nav link list. When the warehouse preview flag is
 * on, the Research entry point is inserted immediately after Home. The legacy
 * Suburb Intelligence link used to be appended here under the same flag, which
 * meant enabling Research in Production also surfaced an unfinished placeholder
 * page; that link (and the page's public entry points) have been removed so
 * Research can be enabled on its own.
 */
export function buildDesktopNavLinks(
  warehousePreviewEnabled: boolean,
  publicLinks: NavLink[],
  researchLink: NavLink
): NavLink[] {
  if (!shouldShowResearchNav(warehousePreviewEnabled)) return publicLinks;
  return [publicLinks[0], researchLink, ...publicLinks.slice(1)];
}
