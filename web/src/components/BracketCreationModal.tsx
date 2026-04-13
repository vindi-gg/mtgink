"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { artCropUrl } from "@/lib/image-utils";

interface Theme {
  id: number;
  label: string;
  theme_type: string;
  pool_size_estimate: number;
  preview_set_code: string | null;
  preview_collector_number: string | null;
  preview_image_version: string | null;
  tribe?: string | null;
  tag_id?: string | null;
  set_code?: string | null;
  artist?: string | null;
}

const SIZES = [16, 32, 64, 128, 256, 512] as const;
const ALL_SIZE = -1; // sentinel: use all available cards (capped at 512)

interface BracketCreationModalProps {
  open: boolean;
  onClose: () => void;
}

export default function BracketCreationModal({ open, onClose }: BracketCreationModalProps) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme | null>(null);
  const [bracketSize, setBracketSize] = useState<number>(16);
  const [loadingTheme, setLoadingTheme] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRandomTheme = useCallback(async (minPool: number) => {
    setLoadingTheme(true);
    setError(null);
    try {
      const res = await fetch(`/api/bracket/themes?random=1&min_pool=${minPool}`);
      if (!res.ok) throw new Error("Failed to load theme");
      const { theme: t } = await res.json();
      setTheme(t);
    } catch {
      setError("Failed to load theme");
    }
    setLoadingTheme(false);
  }, []);

  // Fetch a random theme only on initial open — not on re-roll
  // (re-roll calls fetchRandomTheme directly from the click handler).
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (open && !initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchRandomTheme(bracketSize);
    }
  }, [open, bracketSize, fetchRandomTheme]);

  const handleSizeChange = (size: number) => {
    setBracketSize(size);
    // If current theme doesn't have enough cards for a fixed size, re-roll
    if (size !== ALL_SIZE && theme && theme.pool_size_estimate && theme.pool_size_estimate < size) {
      setTheme(null);
      fetchRandomTheme(size);
    }
  };

  // Effective size: ALL resolves to min(pool_size_estimate, 512).
  // If unknown, we send 512 and the server returns whatever it can resolve.
  const poolEst = theme?.pool_size_estimate ?? null;
  const effectiveSize = bracketSize === ALL_SIZE
    ? Math.min(poolEst ?? 512, 512)
    : bracketSize;

  const handleStart = async () => {
    if (!theme) return;
    setCreating(true);
    setError(null);
    try {
      // Strip " Gauntlet" / " Remix" suffix for the label
      const cleanLabel = theme.label.replace(/\s+(Gauntlet|Remix)$/i, "").trim();
      const label = `${cleanLabel} Bracket`;

      const res = await fetch("/api/bracket/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params: { source: "theme", themeId: theme.id },
          label,
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

  if (!open) return null;

  const previewImg = theme?.preview_set_code && theme?.preview_collector_number
    ? artCropUrl(theme.preview_set_code, theme.preview_collector_number, theme.preview_image_version)
    : null;

  // Clean theme label for display
  const displayName = theme?.label.replace(/\s+(Gauntlet|Remix)$/i, "").trim();

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-gray-700 rounded-xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        {/* Theme preview image */}
        <div className="relative aspect-[3/1] bg-gray-800 overflow-hidden">
          {previewImg ? (
            <img
              src={previewImg}
              alt={displayName ?? ""}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-amber-900/30 to-gray-900 flex items-center justify-center">
              {loadingTheme ? (
                <svg className="animate-spin h-6 w-6 text-amber-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <span className="text-2xl font-bold text-amber-400/30">{displayName}</span>
              )}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
        </div>

        <div className="p-5 space-y-4">
          {/* Theme name + re-roll */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">
                {loadingTheme ? "Rolling..." : displayName ?? "Pick a theme"}
              </h2>
              {theme && (
                <p className="text-xs text-gray-500">
                  {theme.theme_type}{poolEst ? ` · ~${poolEst} cards` : ""}
                </p>
              )}
            </div>
            <button
              onClick={() => fetchRandomTheme(bracketSize)}
              disabled={loadingTheme}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loadingTheme ? "..." : "Re-roll"}
            </button>
          </div>

          {/* Size selector */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 block">Bracket Size</label>
            <div className="flex flex-wrap gap-1.5">
              {SIZES.map((size) => {
                const tooFew = poolEst != null && poolEst < size;
                return (
                  <button
                    key={size}
                    onClick={() => handleSizeChange(size)}
                    disabled={tooFew}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      bracketSize === size
                        ? "bg-amber-500 text-gray-900"
                        : tooFew
                          ? "bg-gray-900 text-gray-700 cursor-not-allowed"
                          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
              <button
                onClick={() => handleSizeChange(ALL_SIZE)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  bracketSize === ALL_SIZE
                    ? "bg-amber-500 text-gray-900"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                All{poolEst ? ` (~${Math.min(poolEst, 512)})` : ""}
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleStart}
              disabled={!theme || creating || loadingTheme}
              className="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {creating ? "Creating..." : "Start Bracket"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
