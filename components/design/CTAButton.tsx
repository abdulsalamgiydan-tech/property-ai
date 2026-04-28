import Link from "next/link";
import React, { type ButtonHTMLAttributes, type ReactNode } from "react";

type CTAButtonVariant = "primary" | "secondary" | "ghost";

type BaseProps = {
  children: ReactNode;
  variant?: CTAButtonVariant;
  className?: string;
};

type CTAButtonProps =
  | (BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
  | (BaseProps & { href: string; onClick?: never; type?: never });

function variantClasses(variant: CTAButtonVariant): string {
  if (variant === "secondary") {
    return "border border-zinc-600/80 bg-zinc-900/80 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800/80";
  }
  if (variant === "ghost") {
    return "border border-transparent bg-transparent text-zinc-400 hover:text-zinc-200";
  }
  return "border border-violet-500/70 bg-violet-600 text-white hover:bg-violet-500";
}

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/35";

export function CTAButton(props: CTAButtonProps) {
  const { children, variant = "primary", className } = props;
  const classes = `${baseClasses} ${variantClasses(variant)} ${className ?? ""}`;

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button {...props} className={classes}>
      {children}
    </button>
  );
}
