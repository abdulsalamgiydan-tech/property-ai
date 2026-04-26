"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const publicLinks = [
  { href: "/analyse-property", label: "Analyse" },
  { href: "/compare-properties", label: "Compare" },
  { href: "/suburb-intelligence", label: "Suburbs" },
];

const signedInLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Navbar() {
  const { user, loading, openEarlyAccessModal, signOut } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const allLinks = user ? [...publicLinks, ...signedInLinks] : publicLinks;

  return (
    <nav className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white transition hover:text-violet-300"
        >
          <span className="text-violet-400">▲</span>
          <span>Propellect</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 sm:flex">
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

        {/* Auth actions */}
        <div className="hidden items-center gap-2 sm:flex">
          {loading ? null : user ? (
            <>
              <span className="text-xs text-zinc-500 truncate max-w-[12rem]">{user.email}</span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800/60"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openEarlyAccessModal}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500"
            >
              Sign in
            </button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="flex items-center justify-center rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-200 sm:hidden"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-zinc-800/80 bg-zinc-950/95 px-4 pb-4 pt-2 sm:hidden">
          <div className="flex flex-col gap-1">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  pathname === link.href
                    ? "bg-violet-600/20 text-violet-300"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-zinc-800/60 pt-2">
              {user ? (
                <>
                  <p className="px-3 py-1 text-xs text-zinc-500 truncate">{user.email}</p>
                  <button
                    type="button"
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-200"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { openEarlyAccessModal(); setMenuOpen(false); }}
                  className="w-full rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white"
                >
                  Sign in / Get early access
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
