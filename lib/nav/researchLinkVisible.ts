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
 * Builds the desktop primary-nav link list. Suburb Intelligence shares the
 * same warehouse-preview gate as Research: both surfaces depend on warehouse
 * data that only exists where WAREHOUSE_PREVIEW_ENABLED is on, so both must
 * appear and disappear together. Suburb Intelligence was previously
 * unconditional in `publicLinks` — an ungated placeholder that stayed live
 * in Production while Research itself was correctly gated (Sprint 18.1
 * hotfix, discovered via real authenticated Production UAT).
 */
export function buildDesktopNavLinks(
  warehousePreviewEnabled: boolean,
  publicLinks: NavLink[],
  researchLink: NavLink,
  suburbIntelligenceLink: NavLink
): NavLink[] {
  if (!shouldShowResearchNav(warehousePreviewEnabled)) return publicLinks;
  return [publicLinks[0], researchLink, ...publicLinks.slice(1), suburbIntelligenceLink];
}
