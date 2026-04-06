"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Tribe } from "@/lib/types";

export default function TribesListClient({ tribes }: { tribes: Tribe[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return tribes;
    const q = query.toLowerCase();
    return tribes.filter((t) => t.tribe.toLowerCase().includes(q));
  }, [tribes, query]);

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creature types..."
          className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
        />
      </div>
      <p className="text-gray-400 text-sm mb-4">
        {filtered.length} creature types
      </p>
      <div className="grid gap-1">
        {filtered.map((tribe) => (
          <Link
            key={tribe.slug}
            href={`/db/tribes/${tribe.slug}`}
            className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <span className="text-white font-medium">{tribe.tribe}</span>
            <span className="text-gray-500 text-sm">
              {tribe.card_count.toLocaleString()} cards
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
