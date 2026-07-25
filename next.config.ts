import type { NextConfig } from "next";

/**
 * Security headers (Sprint 14 WS16) — this app previously shipped with
 * zero security headers configured (verified: no next.config headers(),
 * no middleware Set-Header). Scoped to this app's actual real origins,
 * not a copy-pasted generic policy:
 * - Supabase (auth + REST + realtime) for the main app project.
 * - OpenStreetMap tiles for the national map (components/research/MarketMapExplorer.tsx).
 * - Vercel Analytics/Speed Insights script + collector (@vercel/analytics is a real dependency).
 * - Anthropic is called server-side only (Strategy Generator, research copilot) — never
 *   needs a browser CSP allowance.
 *
 * script-src/style-src keep 'unsafe-inline' because Next.js's hydration
 * bootstrap and Tailwind's inline styles need it without a nonce-based
 * setup (a stricter nonce CSP is real follow-on work, not attempted here
 * to avoid breaking the app without the ability to fully browser-test
 * every path against a nonce policy in this pass).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
