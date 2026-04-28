import Link from "next/link";
import React from "react";

type MobileNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
};

type MobileNavProps = {
  items: MobileNavItem[];
  className?: string;
};

export function MobileNav({ items, className }: MobileNavProps) {
  return (
    <nav
      className={`border-t border-zinc-700/80 bg-zinc-900/95 px-2 pb-safe pt-2 backdrop-blur-xl ${className ?? ""}`}
      aria-label="Mobile navigation"
    >
      <ul className="grid grid-cols-5 gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium transition ${
                item.active ? "text-violet-300" : "text-zinc-500"
              }`}
            >
              <span aria-hidden className={item.active ? "text-violet-300" : "text-zinc-500"}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
