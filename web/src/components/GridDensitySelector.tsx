"use client";

import type { GridDensity } from "@/lib/grid-density";

// Mobile cols: 3→1, 4→2, 5→3. Desktop cols: 3→3, 4→4, 5→5.
const MOBILE_COLS: Record<GridDensity, number> = { "3": 1, "4": 2, "5": 3 };
const DESKTOP_COLS: Record<GridDensity, number> = { "3": 3, "4": 4, "5": 5 };

function GridIcon({ cols }: { cols: number }) {
  const size = 18;
  const gap = 1;
  const cellSize = (size - gap * (cols - 1)) / cols;
  const rows = Math.min(cols, 2);
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push(
        <rect
          key={`${r}-${c}`}
          x={c * (cellSize + gap)}
          y={r * (cellSize + gap)}
          width={cellSize}
          height={cellSize}
          rx={0.5}
        />
      );
    }
  }
  const totalH = rows * cellSize + (rows - 1) * gap;
  return (
    <svg width={size} height={totalH} viewBox={`0 0 ${size} ${totalH}`} fill="currentColor">
      {rects}
    </svg>
  );
}

export default function GridDensitySelector({
  density,
  onChange,
}: {
  density: GridDensity;
  onChange: (d: GridDensity) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {(["3", "4", "5"] as GridDensity[]).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`p-1.5 rounded cursor-pointer transition-colors ${
            density === d
              ? "bg-gray-700 text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
          title={`${d} columns`}
        >
          {/* Show mobile-appropriate icon on small screens, desktop on md+ */}
          <span className="md:hidden">
            <GridIcon cols={MOBILE_COLS[d]} />
          </span>
          <span className="hidden md:inline">
            <GridIcon cols={DESKTOP_COLS[d]} />
          </span>
        </button>
      ))}
    </div>
  );
}
