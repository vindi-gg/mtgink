"use client";

import { useState, useEffect } from "react";
import { useExpansionCounts } from "@/lib/expansion-context";
import { PlayModeIcon, BRACKET_ICON } from "@/lib/play-modes";
import CreateBracketPanel from "./CreateBracketPanel";

export default function MobileBracketFab() {
  const { setCode } = useExpansionCounts();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!setCode) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-amber-500 text-gray-900 font-bold text-sm shadow-lg shadow-black/40 hover:bg-amber-400 transition-colors cursor-pointer"
        aria-label="Create bracket from current filters"
      >
        <span>Play</span>
        <PlayModeIcon d={BRACKET_ICON} className="w-5 h-5" />
      </button>
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/70 flex items-end justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-gray-900 border-t border-gray-800 rounded-t-2xl p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>
            <CreateBracketPanel compact />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full py-2 text-xs font-medium text-gray-400 hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
