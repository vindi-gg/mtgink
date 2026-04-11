"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { useExpansionCounts } from "@/lib/expansion-context";
import { PlayModeIcon, BRACKET_ICON } from "@/lib/play-modes";

type SizeChoice = 8 | 16 | 32 | 64 | 128 | "all";
const SIZE_OPTIONS: SizeChoice[] = [8, 16, 32, 64, 128, "all"];

function makeSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function pickDefaultSize(count: number): SizeChoice {
  if (count >= 32) return 32;
  if (count >= 16) return 16;
  if (count >= 8) return 8;
  return "all";
}

export default function CreateBracketPanel({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { setCode, filteredCount, totalCount } = useExpansionCounts();
  const searchParams = useSearchParams();

  const hasFilters = useMemo(() => {
    if (!searchParams) return false;
    return Boolean(searchParams.get("rarities")) || (searchParams.get("printing") && searchParams.get("printing") !== "all");
  }, [searchParams]);

  const effectiveCount = filteredCount || totalCount;
  const [selected, setSelected] = useState<SizeChoice>(() => pickDefaultSize(effectiveCount));

  // If the filtered count drops below the currently selected size, fall back
  // to the largest valid option so the user isn't stuck with a disabled pick.
  useEffect(() => {
    if (selected !== "all" && effectiveCount < selected) {
      setSelected(pickDefaultSize(effectiveCount));
    }
  }, [effectiveCount, selected]);

  if (!setCode) return null;

  const canLaunch = effectiveCount >= 2 && (selected === "all" || effectiveCount >= selected);

  const handleLaunch = () => {
    if (!canLaunch) return;
    const sp = new URLSearchParams();
    sp.set("set_code", setCode);
    const rarities = searchParams?.get("rarities");
    if (rarities) sp.set("rarities", rarities);
    const printing = searchParams?.get("printing");
    if (printing && printing !== "all") sp.set("printing", printing);
    sp.set("size", String(selected));
    sp.set("seed", makeSeed());
    router.push(`/bracket?${sp.toString()}`);
  };

  return (
    <div className={compact ? "" : "bg-gray-900 border border-gray-800 rounded-lg p-4"}>
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        <PlayModeIcon d={BRACKET_ICON} className="w-4 h-4 text-amber-400" />
        Create Bracket
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        {hasFilters ? (
          <>
            <span className="text-amber-400 font-medium">{filteredCount}</span>
            <span className="text-gray-500"> / {totalCount} cards after filters</span>
          </>
        ) : (
          <>
            <span className="text-gray-300 font-medium">{totalCount}</span>
            <span className="text-gray-500"> cards — apply filters to narrow</span>
          </>
        )}
      </p>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {SIZE_OPTIONS.map((size) => {
          const disabled = size !== "all" && effectiveCount < size;
          const isSelected = selected === size;
          const label = size === "all" ? "All" : String(size);
          return (
            <button
              key={String(size)}
              type="button"
              onClick={() => !disabled && setSelected(size)}
              disabled={disabled}
              className={`flex items-center justify-center px-2 py-1.5 text-xs font-bold rounded border transition-colors ${
                disabled
                  ? "bg-gray-900 text-gray-700 border-gray-800 cursor-not-allowed"
                  : isSelected
                    ? "bg-amber-500 text-gray-900 border-amber-500 cursor-pointer"
                    : "bg-gray-800 text-amber-400 border-amber-500/30 hover:bg-gray-700 cursor-pointer"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleLaunch}
        disabled={!canLaunch}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-colors ${
          canLaunch
            ? "bg-amber-500 text-gray-900 hover:bg-amber-400 cursor-pointer"
            : "bg-gray-800 text-gray-600 cursor-not-allowed"
        }`}
      >
        <PlayModeIcon d={BRACKET_ICON} className="w-4 h-4" />
        Launch Bracket
      </button>
      <p className="text-[10px] text-gray-600 mt-2 leading-snug">
        Single-elimination from the filtered cards. Share the URL to play the same matchups.
      </p>
    </div>
  );
}
