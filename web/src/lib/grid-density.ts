"use client";

import { useState, useEffect } from "react";

export type GridDensity = "3" | "4" | "5";

const STORAGE_KEY = "mtgink_grid_density";
const DEFAULT_DENSITY: GridDensity = "4";

function getInitialDensity(): GridDensity {
  if (typeof window === "undefined") return DEFAULT_DENSITY;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "3" || saved === "4" || saved === "5") return saved;
  return DEFAULT_DENSITY;
}

export function useGridDensity() {
  const [density, setDensity] = useState<GridDensity>(getInitialDensity);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, density);
  }, [density]);

  return { density, setDensity };
}

export const GRID_CLASSES: Record<GridDensity, string> = {
  "3": "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3",
  "4": "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3",
  "5": "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2",
};
