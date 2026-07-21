"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function ExploreFilterForm({
  initialQuery = "",
  initialJurisdiction = "",
  initialGeographyType = "",
}: {
  initialQuery?: string;
  initialJurisdiction?: string;
  initialGeographyType?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction);
  const [geographyType, setGeographyType] = useState(initialGeographyType);
  const router = useRouter();

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (jurisdiction) params.set("state", jurisdiction);
        if (geographyType) params.set("type", geographyType);
        router.push(`/research/explore?${params.toString()}`);
      }}
    >
      <div className="flex-1">
        <label className="mb-1 block text-xs text-zinc-500">Search</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suburb or postcode name"
          aria-label="Search suburb or postcode"
          className="w-full rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/60 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">State</label>
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
          aria-label="Filter by state"
          className="rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 focus:border-violet-500/60 focus:outline-none"
        >
          <option value="">All states</option>
          <option value="NSW">NSW</option>
          <option value="VIC">VIC</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Geography type</label>
        <select
          value={geographyType}
          onChange={(e) => setGeographyType(e.target.value)}
          aria-label="Filter by geography type"
          className="rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 focus:border-violet-500/60 focus:outline-none"
        >
          <option value="">Suburb + postcode</option>
          <option value="SAL">Suburb</option>
          <option value="POA">Postcode</option>
        </select>
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-xl border border-violet-500/40 bg-violet-600/20 px-5 py-2.5 text-sm font-medium text-violet-200 transition hover:bg-violet-600/30"
      >
        Filter
      </button>
    </form>
  );
}
