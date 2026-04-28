import React from "react";
import { Lock } from "@/components/auth/LockIcon";
import { CTAButton } from "@/components/design/CTAButton";

type LockedCardProps = {
  title?: string;
  bulletPoints?: string[];
  ctaLabel?: string;
  onCtaClick: () => void;
  className?: string;
};

const defaultBullets = [
  "key risks",
  "what needs to improve",
  "deeper decision guidance",
];

export function LockedCard({
  title = "Unlock the full decision view",
  bulletPoints = defaultBullets,
  ctaLabel = "Get free early access",
  onCtaClick,
  className,
}: LockedCardProps) {
  return (
    <div
      className={`w-full max-w-md rounded-2xl border border-violet-500/35 bg-zinc-900/95 p-6 shadow-2xl shadow-violet-950/40 backdrop-blur-md ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/40 bg-violet-950/50 text-violet-200">
          <Lock className="size-4" />
        </span>
        <div>
          <h3 className="text-base font-semibold tracking-tight text-white">{title}</h3>
          <p className="mt-2 text-sm text-zinc-300">
            You have seen the numbers. Get free early access to unlock:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-zinc-300 marker:text-zinc-600">
            {bulletPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <CTAButton className="mt-5 w-full" onClick={onCtaClick}>
        {ctaLabel}
      </CTAButton>
    </div>
  );
}
