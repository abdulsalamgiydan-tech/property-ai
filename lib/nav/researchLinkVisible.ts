/**
 * Whether the primary nav should show the Research entry point. Kept as a
 * standalone pure function (rather than inlined in the client Navbar) so
 * the gating logic is unit-testable without mounting a component or
 * mocking auth/router context.
 */
export function shouldShowResearchNav(warehousePreviewEnabled: boolean): boolean {
  return warehousePreviewEnabled;
}
