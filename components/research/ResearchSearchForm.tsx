"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function ResearchSearchForm({ initialQuery = "" }: { initialQuery?: string }) {
  const [value, setValue] = useState(initialQuery);
  const router = useRouter();

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) router.push(`/research?q=${encodeURIComponent(value.trim())}`);
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search a suburb name or postcode (e.g. Parramatta, 2150)"
        aria-label="Search suburb or postcode"
        className="w-full rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/60 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl border border-violet-500/40 bg-violet-600/20 px-5 py-2.5 text-sm font-medium text-violet-200 transition hover:bg-violet-600/30"
      >
        Search
      </button>
    </form>
  );
}
