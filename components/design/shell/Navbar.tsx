import Link from "next/link";
import React from "react";
import { CTAButton } from "@/components/design/CTAButton";
import { LogoMark } from "@/components/design/LogoMark";

type NavLink = { href: string; label: string };

type NavbarProps = {
  links: NavLink[];
  rightCtaHref?: string;
  rightCtaLabel?: string;
  signedIn?: boolean;
  className?: string;
};

export function Navbar({
  links,
  rightCtaHref,
  rightCtaLabel,
  signedIn,
  className,
}: NavbarProps) {
  return (
    <header
      className={`border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl ${className ?? ""}`}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-5 px-4 sm:px-6">
        <LogoMark size={28} />
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <span className="hidden rounded-full border border-emerald-500/35 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 sm:inline-flex">
              Signed in
            </span>
          ) : null}
          {rightCtaHref && rightCtaLabel ? (
            <CTAButton href={rightCtaHref}>{rightCtaLabel}</CTAButton>
          ) : null}
        </div>
      </div>
    </header>
  );
}
