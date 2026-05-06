"use client";

import { useState } from "react";
import SetPickerModal from "./SetPickerModal";
import SetGraphicalTile from "./SetGraphicalTile";
import type { MtgSet } from "@/lib/types";

interface Props {
  /** Up to 8 tiles. Homepage row shows only the first 4; modal shows all.
   *  Hero data is read directly off the set rows (cached nightly). */
  tiles: MtgSet[];
  /** Sets searched in the picker modal. */
  allSets: MtgSet[];
  activeSetCode: string;
}

export default function SetTileRow({ tiles, allSets, activeSetCode }: Props) {
  const [open, setOpen] = useState(false);
  const visible = tiles.slice(0, 4);
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {visible.map((t) => (
          <SetGraphicalTile
            key={t.set_code}
            set={t}
            isActive={t.set_code === activeSetCode}
            href={`/sets/${t.set_code}`}
            size="lg"
          />
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-gray-400 hover:text-amber-300 transition-colors cursor-pointer"
        >
          Browse all sets →
        </button>
      </div>

      <SetPickerModal
        latest={tiles}
        allSets={allSets}
        activeSetCode={activeSetCode}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
