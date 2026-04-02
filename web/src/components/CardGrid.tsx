"use client";

import Link from "next/link";
import { useState } from "react";
import { useImageMode } from "@/lib/image-mode";
import { useGridDensity, GRID_CLASSES } from "@/lib/grid-density";
import GridDensitySelector from "./GridDensitySelector";
import type { BrowseCard } from "@/lib/types";

export default function CardGrid({ cards }: { cards: BrowseCard[] }) {
  const { cardUrl } = useImageMode();
  const { density, setDensity } = useGridDensity();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <GridDensitySelector density={density} onChange={setDensity} />
        <button
          onClick={() => setShowInfo(!showInfo)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            showInfo
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
          }`}
          title={showInfo ? "Hide card info" : "Show card info"}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Info
        </button>
      </div>

      <div className={GRID_CLASSES[density]} suppressHydrationWarning>
        {cards.map((card) => (
          <Link
            key={card.oracle_id}
            href={`/card/${card.slug}`}
            className="group relative"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cardUrl(card.set_code, card.collector_number, card.image_version)}
              alt={card.name}
              className="w-full rounded-lg border border-gray-800 group-hover:border-amber-500/50 transition-colors"
              loading="lazy"
            />
            {showInfo && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent rounded-b-lg p-2 pt-6">
                <p className="text-xs text-white font-medium truncate">{card.name}</p>
                {card.type_line && (
                  <p className="text-[10px] text-gray-400 truncate">{card.type_line}</p>
                )}
                {card.cheapest_price != null && (
                  <p className="text-[10px] text-amber-400 font-medium">${card.cheapest_price.toFixed(2)}</p>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
