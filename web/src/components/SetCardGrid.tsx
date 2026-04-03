"use client";

import { useState, useMemo } from "react";
import { useImageMode } from "@/lib/image-mode";
import { useGridDensity, GRID_CLASSES } from "@/lib/grid-density";
import GridDensitySelector from "./GridDensitySelector";
import CardLightbox from "./CardLightbox";
import type { SetCard } from "@/lib/types";
import type { BrowseCard } from "@/lib/types";

function toBrowseCard(card: SetCard, setCode: string): BrowseCard {
  return {
    oracle_id: card.oracle_id,
    name: card.name,
    slug: card.slug,
    type_line: card.type_line,
    mana_cost: card.mana_cost,
    set_code: setCode,
    collector_number: card.collector_number,
    image_version: card.image_version,
  };
}

const RARITIES = [
  { key: "common", label: "C" },
  { key: "uncommon", label: "UC" },
  { key: "rare", label: "R" },
  { key: "mythic", label: "M" },
] as const;

const RARITY_ACTIVE: Record<string, string> = {
  common: "bg-gray-700 text-gray-200",
  uncommon: "bg-gray-600 text-gray-100",
  rare: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  mythic: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

type SortKey = "number" | "name" | "rarity";

function parseCollectorNumber(cn: string): [number, string] {
  const match = cn.match(/^(\d+)(.*)/);
  if (match) return [parseInt(match[1], 10), match[2]];
  return [Infinity, cn];
}

const RARITY_ORDER: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

function sortCards(cards: SetCard[], key: SortKey): SetCard[] {
  const sorted = [...cards];
  switch (key) {
    case "number":
      sorted.sort((a, b) => {
        const [aNum, aSuf] = parseCollectorNumber(a.collector_number);
        const [bNum, bSuf] = parseCollectorNumber(b.collector_number);
        return aNum - bNum || aSuf.localeCompare(bSuf);
      });
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "rarity":
      sorted.sort((a, b) => (RARITY_ORDER[a.rarity ?? "common"] ?? 9) - (RARITY_ORDER[b.rarity ?? "common"] ?? 9));
      break;
  }
  return sorted;
}

export default function SetCardGrid({
  cards,
  setCode,
}: {
  cards: SetCard[];
  setCode: string;
}) {
  const { imageMode, toggleImageMode, cardUrl } = useImageMode();
  const { density, setDensity } = useGridDensity();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [rarityFilter, setRarityFilter] = useState<Set<string>>(new Set());

  const toggleRarity = (r: string) => {
    setRarityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
    setLightboxIdx(null);
  };

  const filtered = useMemo(() => {
    let result = cards;
    if (rarityFilter.size > 0) {
      result = result.filter((card) => rarityFilter.has(card.rarity ?? "common"));
    }
    return sortCards(result, sortKey);
  }, [cards, rarityFilter, sortKey]);

  return (
    <>
      {/* Controls row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Art/Card toggle — visible on mobile */}
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          <button
            onClick={() => { if (imageMode !== "art") toggleImageMode(); }}
            className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              imageMode === "art"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Art
          </button>
          <button
            onClick={() => { if (imageMode !== "card") toggleImageMode(); }}
            className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              imageMode === "card"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Card
          </button>
        </div>

        <GridDensitySelector density={density} onChange={setDensity} />

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Sort:</span>
          {(["number", "name", "rarity"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => { setSortKey(key); setLightboxIdx(null); }}
              className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                sortKey === key
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
              }`}
            >
              {key === "number" ? "#" : key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>

        {/* Rarity filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Rarity:</span>
          {RARITIES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleRarity(key)}
              className={`min-w-[2rem] px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                rarityFilter.has(key)
                  ? `${RARITY_ACTIVE[key]} border`
                  : "bg-gray-800 text-gray-500 hover:text-gray-300 border border-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Result count when filtered */}
        {rarityFilter.size > 0 && (
          <span className="text-xs text-gray-500">{filtered.length} / {cards.length}</span>
        )}
      </div>

      <div className={GRID_CLASSES[density]} suppressHydrationWarning>
        {filtered.map((card, i) => (
          <button
            key={card.scryfall_id}
            onClick={() => setLightboxIdx(i)}
            className="group relative text-left cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cardUrl(setCode, card.collector_number, card.image_version)}
              alt={card.name}
              className="w-full rounded-lg border border-gray-800 group-hover:border-amber-500/50 transition-colors"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {lightboxIdx !== null && lightboxIdx < filtered.length && (
        <CardLightbox
          card={toBrowseCard(filtered[lightboxIdx], setCode)}
          imageUrl={cardUrl(setCode, filtered[lightboxIdx].collector_number, filtered[lightboxIdx].image_version)}
          index={lightboxIdx}
          total={filtered.length}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined}
          onNext={lightboxIdx < filtered.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : undefined}
        />
      )}
    </>
  );
}
