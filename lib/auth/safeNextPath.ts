/**
 * Restrict post-auth redirects to same-origin paths (no open redirects).
 */
export function safeInternalNextPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return "/";
  }

  // URL parsers ignore some control characters and treat backslashes as
  // slashes, which can turn paths such as "/\n/evil.example" into an
  // external, scheme-relative redirect.
  if (/[\u0000-\u001f\u007f]/.test(decoded) || decoded.includes("\\")) return "/";
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/";
  const lower = decoded.toLowerCase();
  if (lower.startsWith("/http") || lower.startsWith("/\\")) return "/";

  try {
    const internalOrigin = new URL("https://internal.invalid");
    if (new URL(decoded, internalOrigin).origin !== internalOrigin.origin) return "/";
  } catch {
    return "/";
  }

  return decoded;
}
