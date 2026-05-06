"use client";

import { useState } from "react";
import { artCropUrl } from "@/lib/image-utils";
import SetPickerModal from "./SetPickerModal";
import type { MtgSet } from "@/lib/types";

interface Props {
  activeSet: MtgSet;
  /** Recent / featured sets shown in the picker modal's "Latest" grid. */
  latest: MtgSet[];
  /** Sets searched in the picker modal's text search. */
  allSets: MtgSet[];
  /** Optional second line under the set name. */
  metaText?: string;
}

export default function SetPickerButton({
  activeSet,
  latest,
  allSets,
  metaText,
}: Props) {
  const [open, setOpen] = useState(false);
  const bg = activeSet.hero_set_code && activeSet.hero_collector_number
    ? artCropUrl(activeSet.hero_set_code, activeSet.hero_collector_number, activeSet.hero_image_version)
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full h-16 rounded-lg overflow-hidden border border-gray-800 hover:border-amber-500/50 transition-colors cursor-pointer"
      >
        {bg ? (
          <img
            src={bg}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            loading="eager"
          />
        ) : (
          <div className="absolute inset-0 bg-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {activeSet.icon_svg_uri && (
              <img
                src={activeSet.icon_svg_uri}
                alt=""
                className="w-5 h-5 invert opacity-90 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              />
            )}
            <div className="min-w-0 text-left">
              <p className="text-sm md:text-base font-bold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] flex items-center gap-2">
                <span className="truncate">{activeSet.name}</span>
                {activeSet.is_preview && (
                  <span className="text-[9px] uppercase tracking-wide text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded shrink-0">
                    Preview
                  </span>
                )}
              </p>
              {metaText && (
                <p className="text-[11px] text-gray-200/90 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  {metaText}
                </p>
              )}
            </div>
          </div>
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm shrink-0">
            <svg
              className="w-3.5 h-3.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
      </button>

      <SetPickerModal
        latest={latest}
        allSets={allSets}
        activeSetCode={activeSet.set_code}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
