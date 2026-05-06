"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SetGraphicalTile from "./SetGraphicalTile";
import type { MtgSet } from "@/lib/types";

interface Props {
  /** All non-digital sets, sorted by released_at desc on the server.
   *  Each set carries its own cached `hero_*` columns (computed nightly
   *  by scripts/compute_set_heroes.sql). */
  sets: MtgSet[];
}

const MAINLINE_TYPES = new Set([
  "expansion",
  "core",
  "masters",
  "draft_innovation",
  "commander",
  "masterpiece",
]);

const PAGE_SIZE = 20;

export default function SetsBrowseClient({ sets }: Props) {
  const [query, setQuery] = useState("");
  const [mainlineOnly, setMainlineOnly] = useState(true);
  const [includeSubsets, setIncludeSubsets] = useState(false);

  const filtered = useMemo(() => {
    let items = sets;
    if (mainlineOnly) {
      items = items.filter((s) => MAINLINE_TYPES.has(s.set_type ?? ""));
    }
    if (!includeSubsets) {
      items = items.filter((s) => !s.parent_set_code);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.set_code.toLowerCase().includes(q),
      );
    }
    return items;
  }, [sets, mainlineOnly, includeSubsets, query]);

  // Infinite scroll: render PAGE_SIZE tiles, append more when the sentinel
  // scrolls into view. (Heroes are baked into each set row already, so
  // there's no per-tile fetching — just rendering.)
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [mainlineOnly, includeSubsets, query]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (displayCount >= filtered.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setDisplayCount((n) => Math.min(filtered.length, n + PAGE_SIZE));
        }
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length, displayCount]);

  const visible = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;

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
          {filtered.length === sets.length
            ? `${sets.length} sets`
            : `${filtered.length} of ${sets.length} sets`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMainlineOnly(!mainlineOnly)}
            className={pillClass(mainlineOnly)}
            title="Limit to playable set types: expansion, core, masters, draft_innovation, commander, masterpiece"
          >
            {mainlineOnly ? "✓ Mainline" : "Mainline"}
          </button>
          <button
            onClick={() => setIncludeSubsets(!includeSubsets)}
            className={pillClass(includeSubsets)}
            title="Include subsets (Mystical Archive, Commander decks, etc.)"
          >
            {includeSubsets ? "✓ Subsets" : "Subsets"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-500 py-12">No sets match.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((s) => (
              <SetGraphicalTile
                key={s.set_code}
                set={s}
                href={`/sets/${s.set_code}`}
                size="lg"
                showYear
              />
            ))}
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="py-8 text-center text-xs text-gray-500">
              Loading more…
            </div>
          )}
        </>
      )}
    </>
  );
}
