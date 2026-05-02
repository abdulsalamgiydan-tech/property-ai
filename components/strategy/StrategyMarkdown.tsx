"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

export const strategyMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-10 border-b border-zinc-700/60 pb-2 text-xl font-semibold tracking-tight text-white first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 text-lg font-semibold tracking-tight text-zinc-100 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 text-base font-semibold text-zinc-200">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mt-3 text-sm leading-relaxed text-zinc-300 first:mt-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-500">
      {children}
    </ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-violet-400 underline-offset-2 hover:text-violet-300 hover:underline">
      {children}
    </a>
  ),
  hr: () => <hr className="my-8 border-zinc-700/60" />,
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-2 border-violet-500/40 pl-4 text-sm italic text-zinc-400">
      {children}
    </blockquote>
  ),
};

export function StrategyMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="strategy-markdown rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-6 sm:p-8">
      <ReactMarkdown components={strategyMarkdownComponents}>{markdown}</ReactMarkdown>
    </div>
  );
}
