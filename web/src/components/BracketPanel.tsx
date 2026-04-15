"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { PlayModeIcon, BRACKET_ICON } from "@/lib/play-modes";

type SizeChoice = 8 | 16 | 32 | 64 | 128 | "all";
const SIZE_OPTIONS: SizeChoice[] = [8, 16, 32, 64, 128, "all"];

function pickDefaultSize(count: number): SizeChoice {
  if (count >= 32) return 32;
  if (count >= 16) return 16;
  if (count >= 8) return 8;
  return "all";
}

interface BracketPanelProps {
  sourceType: "tribe" | "artist" | "card";
  sourceParam: string;
  totalCount: number;
  label: string;
  compact?: boolean;
}

export default function BracketPanel({
  sourceType,
  sourceParam,
  totalCount,
  label,
  compact = false,
}: BracketPanelProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<SizeChoice>(() => pickDefaultSize(totalCount));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected !== "all" && totalCount < selected) {
      setSelected(pickDefaultSize(totalCount));
    }
  }, [totalCount, selected]);

  const effectiveSize = selected === "all" ? Math.min(totalCount, 512) : selected;
  const canLaunch = totalCount >= 2 && !creating && (selected === "all" || totalCount >= selected);

  const handleLaunch = async () => {
    if (!canLaunch) return;
    setCreating(true);
    setError(null);
    try {
      const cleanLabel = label.replace(/\s+(Gauntlet|Remix)$/i, "").trim();
      const res = await fetch("/api/bracket/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params: { source: sourceType, sourceId: sourceParam },
          label: `${cleanLabel} Bracket`,
          bracket_size: effectiveSize,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to create bracket");
      }
      const { id } = await res.json();
      router.push(`/bracket?seed=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bracket");
      setCreating(false);
    }
  };

  const countLabel = sourceType === "card" ? "illustrations" : "cards";

  return (
    <div className={compact ? "" : "bg-gray-900 border border-gray-800 rounded-lg p-4"}>
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        <PlayModeIcon d={BRACKET_ICON} className="w-4 h-4 text-amber-400" />
        Create Bracket
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        <span className="text-gray-300 font-medium">{totalCount}</span>
        <span className="text-gray-500"> {countLabel}</span>
      </p>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {SIZE_OPTIONS.map((size) => {
          const disabled = size !== "all" && totalCount < size;
          const isSelected = selected === size;
          const sizeLabel = size === "all" ? "All" : String(size);
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
              {sizeLabel}
            </button>
          );
        })}
      </div>
      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
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
        {creating ? "Creating..." : "Launch Bracket"}
      </button>
      <p className="text-[10px] text-gray-600 mt-2 leading-snug">
        Single-elimination bracket. Shareable link created on launch.
      </p>
    </div>
  );
}
