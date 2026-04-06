"use client";

import { useState } from "react";
import Link from "next/link";
import type { MtgSet } from "@/lib/types";

export default function ExpansionsListClient({
  playableSets,
  allSets,
}: {
  playableSets: MtgSet[];
  allSets: MtgSet[];
}) {
  const [showAll, setShowAll] = useState(false);
  const sets = showAll ? allSets : playableSets;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-400 text-sm">
          {sets.length} sets and products
        </p>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-amber-400 hover:text-amber-300 text-sm cursor-pointer"
        >
          {showAll ? "Playable only" : "Show all"}
        </button>
      </div>
      <div className="grid gap-1.5 md:gap-1">
        {sets.map((set) => (
          <Link
            key={set.set_code}
            href={`/db/expansions/${set.set_code}`}
            className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            {set.icon_svg_uri && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={set.icon_svg_uri}
                alt=""
                className="h-5 w-5 invert opacity-70 flex-shrink-0 self-start md:self-center mt-0.5 md:mt-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-white font-medium truncate block text-sm md:text-base">
                {set.name}
              </span>
              <span className="text-gray-500 text-xs md:hidden">
                {set.set_code.toUpperCase()} &middot; {set.released_at?.slice(0, 4)} &middot; {set.card_count} cards
              </span>
            </div>
            <span className="text-gray-500 text-xs uppercase tracking-wide hidden md:inline">
              {set.set_code}
            </span>
            <span className="text-gray-500 text-sm hidden md:inline">
              {set.released_at?.slice(0, 4)}
            </span>
            <span className="text-gray-500 text-sm w-20 text-right hidden md:inline whitespace-nowrap">
              {set.card_count} cards
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
