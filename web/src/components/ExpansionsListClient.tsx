"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { MtgSet } from "@/lib/types";

interface Row {
  set: MtgSet;
  depth: number;
}

/** Build a depth-first, parent-before-children list from the flat set list.
 *  Children are grouped under their parent (if the parent is in the list),
 *  otherwise they're treated as roots so nothing is hidden. */
function buildTree(sets: MtgSet[]): Row[] {
  const bySet = new Map(sets.map((s) => [s.set_code, s]));
  const childrenOf = new Map<string, MtgSet[]>();
  const roots: MtgSet[] = [];

  for (const set of sets) {
    const parent = set.parent_set_code;
    if (parent && bySet.has(parent)) {
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(set);
    } else {
      roots.push(set);
    }
  }

  // Sort each group by release date desc, then name
  const sortGroup = (arr: MtgSet[]) =>
    arr.sort((a, b) => {
      const da = (b.released_at ?? "").localeCompare(a.released_at ?? "");
      if (da !== 0) return da;
      return a.name.localeCompare(b.name);
    });
  sortGroup(roots);
  for (const group of childrenOf.values()) sortGroup(group);

  const rows: Row[] = [];
  const walk = (set: MtgSet, depth: number) => {
    rows.push({ set, depth });
    const kids = childrenOf.get(set.set_code);
    if (kids) {
      for (const k of kids) walk(k, depth + 1);
    }
  };
  for (const r of roots) walk(r, 0);
  return rows;
}

export default function ExpansionsListClient({
  defaultSets,
  allSets,
}: {
  defaultSets: MtgSet[];
  allSets: MtgSet[];
}) {
  const [includeDigital, setIncludeDigital] = useState(false);
  const [mainlineSearch, setMainlineSearch] = useState(true);
  const [query, setQuery] = useState("");
  const sets = includeDigital ? allSets : defaultSets;

  const rows = useMemo(() => {
    const full = buildTree(sets);
    const q = query.trim().toLowerCase();
    if (!q) return full;

    const matches = (s: MtgSet) =>
      s.name.toLowerCase().includes(q) || s.set_code.toLowerCase().includes(q);

    if (mainlineSearch) {
      // Match only root (depth 0) sets, include entire subtree.
      // Once we see a matching root, keep everything until the next root.
      const filtered: Row[] = [];
      let keeping = false;
      for (const row of full) {
        if (row.depth === 0) {
          keeping = matches(row.set);
        }
        if (keeping) filtered.push(row);
      }
      return filtered;
    }

    // Non-mainline: match any set, flatten to depth 0 (no tree context).
    return full
      .filter((row) => matches(row.set))
      .map((row) => ({ set: row.set, depth: 0 }));
  }, [sets, query, mainlineSearch]);

  const pillClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
      active
        ? "bg-amber-500 text-gray-900 border-amber-500"
        : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
    }`;

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter sets by name or code..."
          className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
        />
      </div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <p className="text-gray-400 text-sm">
          {rows.length === sets.length
            ? `${sets.length} sets and products`
            : `${rows.length} of ${sets.length} sets`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMainlineSearch(!mainlineSearch)}
            className={pillClass(mainlineSearch)}
            title="When on, searching matches mainline sets only but includes all of their subsets in the results."
          >
            {mainlineSearch ? "✓ Mainline search" : "Mainline search"}
          </button>
          <button
            onClick={() => setIncludeDigital(!includeDigital)}
            className={pillClass(includeDigital)}
            title="Include Arena / MTGO / Alchemy sets"
          >
            {includeDigital ? "✓ Digital sets" : "Digital sets"}
          </button>
        </div>
      </div>
      <div className="grid gap-1.5 md:gap-1">
        {rows.map(({ set, depth }) => (
          <Link
            key={set.set_code}
            href={`/db/expansions/${set.set_code}`}
            className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
            style={{ marginLeft: depth > 0 ? `${depth * 1.5}rem` : undefined }}
          >
            {depth > 0 && (
              <span
                aria-hidden="true"
                className="text-gray-600 text-sm flex-shrink-0 select-none"
                title="child set"
              >
                ↳
              </span>
            )}
            {set.icon_svg_uri && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={set.icon_svg_uri}
                alt=""
                className={`h-5 w-5 invert flex-shrink-0 self-start md:self-center mt-0.5 md:mt-0 ${
                  depth > 0 ? "opacity-40" : "opacity-70"
                }`}
              />
            )}
            <div className="flex-1 min-w-0">
              <span
                className={`font-medium truncate block text-sm md:text-base ${
                  depth > 0 ? "text-gray-300" : "text-white"
                }`}
              >
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
