"use client";

import { useState } from "react";
import Link from "next/link";
import { normalCardUrl } from "@/lib/image-utils";
import { useImageMode } from "@/lib/image-mode";
import type { BrowseCard } from "@/lib/types";

type GridMode = "grid" | "single";

export default function CardGrid({ cards }: { cards: BrowseCard[] }) {
  const { cardUrl } = useImageMode();
  const [mode, setMode] = useState<GridMode>("grid");

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setMode("grid")}
          className={`p-1.5 rounded ${mode === "grid" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
          title="Grid view"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect x="1" y="1" width="8" height="8" rx="1" />
            <rect x="11" y="1" width="8" height="8" rx="1" />
            <rect x="1" y="11" width="8" height="8" rx="1" />
            <rect x="11" y="11" width="8" height="8" rx="1" />
          </svg>
        </button>
        <button
          onClick={() => setMode("single")}
          className={`p-1.5 rounded ${mode === "single" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
          title="Single column view"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect x="3" y="1" width="14" height="8" rx="1" />
            <rect x="3" y="11" width="14" height="8" rx="1" />
          </svg>
        </button>
      </div>

      <div
        className={
          mode === "single"
            ? "grid grid-cols-1 max-w-sm mx-auto gap-3"
            : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        }
      >
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
            <p className="text-xs text-gray-400 mt-1 truncate text-center">{card.name}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
