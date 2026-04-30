"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { CTAButton } from "@/components/design/CTAButton";
import { GlassPill } from "@/components/design/GlassPill";
import { LogoMark } from "@/components/design/LogoMark";
import Link from "next/link";
import { usePathname } from "next/navigation";

const publicLinks: Array<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/analyse-property", label: "Analyse" },
  { href: "/compare-properties", label: "Compare" },
  { href: "/suburb-intelligence", label: "Suburb intelligence" },
];

const signedInLinks: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
];

const mobileLinks = [
  {
    href: "/dashboard",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h6v10" />
      </svg>
    ),
  },
  {
    href: "/analyse-property",
    label: "Analyse",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    href: "/compare-properties",
    label: "Compare",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M10 4H4v6M20 14h-6v6" />
        <path d="M4 10l6-6M20 14l-6 6" />
      </svg>
    ),
  },
  {
    href: "/watchlist",
    label: "Watchlist",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
] as const;

export function Navbar() {
  const { user, loading, openEarlyAccessModal, signOut } = useAuth();
  const pathname = usePathname();
  const hidden = pathname.startsWith("/auth/");
  const firstNameRaw =
    typeof user?.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name
      : typeof user?.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.split(" ")[0]
        : "";
  const accountLabel = firstNameRaw.trim() || "Account";
  const accountHref = "/dashboard";

  if (hidden) return null;
  const allLinks = user ? [...publicLinks, ...signedInLinks] : publicLinks;

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="shrink-0">
            <LogoMark size={28} />
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  pathname === link.href
                    ? "bg-violet-600/20 text-violet-300"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto hidden items-center gap-2 lg:flex">
            {loading ? null : user ? (
              <>
                <GlassPill className="min-h-9 px-3 text-xs text-zinc-300">
                  <Link href={accountHref} className="hover:text-zinc-100">
                    {accountLabel}
                  </Link>
                </GlassPill>
                <CTAButton variant="secondary" className="px-3 py-2 text-xs" onClick={signOut}>
                  Sign out
                </CTAButton>
              </>
            ) : (
              <CTAButton className="px-3 py-2 text-xs" onClick={openEarlyAccessModal}>
                Sign in / Get started
              </CTAButton>
            )}
          </div>
        </div>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-700/80 bg-zinc-900/95 px-2 pb-safe pt-2 backdrop-blur-xl lg:hidden">
        <ul className="grid grid-cols-5 gap-1">
          {mobileLinks.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium transition ${
                  pathname === item.href ? "text-violet-300" : "text-zinc-500"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!user && !loading ? (
        <div className="fixed bottom-[5.1rem] right-3 z-40 lg:hidden">
          <CTAButton className="px-3 py-2 text-xs shadow-lg shadow-violet-950/60" onClick={openEarlyAccessModal}>
            Sign in
          </CTAButton>
        </div>
      ) : null}

      {user ? (
        <div className="fixed bottom-[5.1rem] left-3 z-40 lg:hidden">
          <div className="flex items-center gap-2">
            <GlassPill className="min-h-9 px-3 text-xs text-zinc-300">
              <Link href={accountHref} className="hover:text-zinc-100">
                {accountLabel}
              </Link>
            </GlassPill>
            <CTAButton variant="secondary" className="px-3 py-2 text-xs" onClick={signOut}>
              Sign out
            </CTAButton>
          </div>
        </div>
      ) : null}

      <div className="h-[4.6rem] lg:hidden" />
    </>
  );
}
