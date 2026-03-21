"use client";

import Link from "next/link";
import { useImageMode } from "@/lib/image-mode";
import { useGridDensity, GRID_CLASSES } from "@/lib/grid-density";
import GridDensitySelector from "./GridDensitySelector";

interface SetCard {
  scryfall_id: string;
  slug: string;
  name: string;
  collector_number: string;
  image_version: string | null;
}

export default function SetCardGrid({
  cards,
  setCode,
}: {
  cards: SetCard[];
  setCode: string;
}) {
  const { cardUrl } = useImageMode();
  const { density, setDensity } = useGridDensity();

  return (
    <>
      <div className="mb-4">
        <GridDensitySelector density={density} onChange={setDensity} />
      </div>

      <div className={GRID_CLASSES[density]} suppressHydrationWarning>
        {cards.map((card) => (
          <Link
            key={card.scryfall_id}
            href={`/card/${card.slug}`}
            className="group relative"
            title={`${card.name} (#${card.collector_number})`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cardUrl(setCode, card.collector_number, card.image_version)}
              alt={card.name}
              className="w-full rounded-lg border border-gray-800 group-hover:border-amber-500/50 transition-colors"
              loading="lazy"
            />
          </Link>
        ))}
      </div>
    </>
  );
}
