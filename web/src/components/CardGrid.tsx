"use client";

import { useState, useEffect, useRef } from "react";
import { useImageMode } from "@/lib/image-mode";
import { useGridDensity, GRID_CLASSES } from "@/lib/grid-density";
import GridDensitySelector from "./GridDensitySelector";
import CardLightbox from "./CardLightbox";
import type { BrowseCard } from "@/lib/types";

interface CardGridProps {
  cards: BrowseCard[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export default function CardGrid({ cards, onLoadMore, hasMore, loadingMore }: CardGridProps) {
  const { cardUrl } = useImageMode();
  const { density, setDensity } = useGridDensity();
  const [showInfo, setShowInfo] = useState(false);
  const [lightboxCard, setLightboxCard] = useState<BrowseCard | null>(null);
  const prevLenRef = useRef(cards.length);

  // When cards grow (load more), advance lightbox to first new card
  useEffect(() => {
    if (cards.length > prevLenRef.current && lightboxCard) {
      const oldLen = prevLenRef.current;
      setLightboxCard(cards[oldLen]);
    }
    prevLenRef.current = cards.length;
  }, [cards.length]);

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
          <button
            key={card.oracle_id}
            onClick={() => setLightboxCard(card)}
            className="group relative text-left cursor-pointer"
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
          </button>
        ))}
      </div>

      {lightboxCard && (() => {
        const idx = cards.findIndex((c) => c.oracle_id === lightboxCard.oracle_id);
        const isLast = idx === cards.length - 1;
        return (
          <CardLightbox
            card={lightboxCard}
            imageUrl={cardUrl(lightboxCard.set_code, lightboxCard.collector_number, lightboxCard.image_version)}
            index={idx}
            total={cards.length}
            onClose={() => setLightboxCard(null)}
            onPrev={idx > 0 ? () => setLightboxCard(cards[idx - 1]) : undefined}
            onNext={isLast && hasMore && onLoadMore
              ? () => { onLoadMore(); }
              : idx < cards.length - 1
                ? () => setLightboxCard(cards[idx + 1])
                : undefined
            }
          />
        );
      })()}
    </>
  );
}
