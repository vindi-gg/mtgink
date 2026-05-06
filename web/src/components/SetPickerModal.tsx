"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SetGraphicalTile from "./SetGraphicalTile";
import type { MtgSet } from "@/lib/types";

interface Props {
  /** Featured grid (with hero images). Up to 8 — last two hidden on mobile.
   *  Hero data is read from the set rows themselves (cached column). */
  latest: MtgSet[];
  /** Full list searched as the user types. Each set carries its own hero. */
  allSets: MtgSet[];
  /** Currently active set; styled as the highlighted tile. */
  activeSetCode: string;
  open: boolean;
  onClose: () => void;
}

const SEARCH_RESULT_CAP = 24;

export default function SetPickerModal({
  latest,
  allSets,
  activeSetCode,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as MtgSet[];
    const starts: MtgSet[] = [];
    const contains: MtgSet[] = [];
    for (const s of allSets) {
      const code = s.set_code.toLowerCase();
      const name = s.name.toLowerCase();
      if (code === q || code.startsWith(q) || name.startsWith(q)) starts.push(s);
      else if (code.includes(q) || name.includes(q)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, SEARCH_RESULT_CAP);
  }, [query, allSets]);

  function pick(code: string) {
    onClose();
    if (code === activeSetCode) return;
    router.push(`/sets/${code}`);
  }

  if (!open || typeof document === "undefined") return null;

  const showLatest = !query;
  const items: MtgSet[] = showLatest ? latest.slice(0, 8) : searchResults;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-16 md:pt-24"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80" />

      <div
        className="relative w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-3 border-b border-gray-800">
          <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sets..."
            className="flex-1 bg-transparent text-white placeholder:text-gray-500 focus:outline-none text-base"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-3">
          {showLatest && (
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2 px-1">Latest</p>
          )}
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">No matches.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map((s, i) => {
                const mobileHidden = showLatest && i >= 6;
                return (
                  <div key={s.set_code} className={mobileHidden ? "hidden sm:block" : ""}>
                    <SetGraphicalTile
                      set={s}
                      isActive={s.set_code === activeSetCode}
                      onClick={() => pick(s.set_code)}
                      size="sm"
                      showYear
                    />
                  </div>
                );
              })}
            </div>
          )}
          {showLatest && (
            <div className="mt-4 text-center">
              <Link
                href="/sets"
                onClick={onClose}
                className="text-xs text-gray-400 hover:text-amber-300 transition-colors"
              >
                Browse all sets →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
