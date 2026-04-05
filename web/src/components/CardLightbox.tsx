"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { BrowseCard } from "@/lib/types";

interface CardLightboxProps {
  card: BrowseCard;
  imageUrl: string;
  backImageUrl?: string;
  index: number;
  total: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function CardLightbox({ card, imageUrl, backImageUrl, index, total, onClose, onPrev, onNext }: CardLightboxProps) {
  const touchStartX = useRef<number | null>(null);
  const [showBack, setShowBack] = useState(false);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if ((e.key === "ArrowLeft" || e.key === "a" || e.key === "A") && onPrev) onPrev();
    if ((e.key === "ArrowRight" || e.key === "d" || e.key === "D") && onNext) onNext();
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  // Reset flip state when card changes
  useEffect(() => { setShowBack(false); }, [imageUrl]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(diff) < 50) return;
    if (diff > 0 && onPrev) onPrev();
    if (diff < 0 && onNext) onNext();
  }

  const illCount = card.illustration_count;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="absolute inset-0 bg-black/85" />

      {/* Arrows + card unit */}
      <div className="relative flex items-center gap-2 md:gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Left arrow */}
        {onPrev ? (
          <button
            onClick={onPrev}
            className="hidden md:block p-2 text-white/20 hover:text-white/60 transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : <div className="hidden md:block w-12" />}

        {/* Art + shelf */}
        <div className="flex flex-col max-w-[90vw] md:max-w-[70vw]">
          <div className="relative">
            <img
              src={showBack && backImageUrl ? backImageUrl : imageUrl}
              alt={card.name}
              className="max-h-[70vh] object-contain rounded-t-lg shadow-2xl"
            />
            {backImageUrl && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowBack(!showBack); }}
                className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors cursor-pointer"
                title="Flip card"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              </button>
            )}
          </div>
          {/* Shelf */}
          <div className="bg-gray-900 border-t border-gray-800 rounded-b-lg px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Link
                  href={`/card/${card.slug}`}
                  className="text-base font-bold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5"
                  onClick={onClose}
                >
                  {card.name}
                  <svg className="w-3.5 h-3.5 text-amber-400/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-2.25-4.125h5.25m0 0v5.25m0-5.25L12.75 14.25" />
                  </svg>
                </Link>
                <p className="text-xs text-gray-500 truncate">
                  {[
                    card.type_line,
                    card.set_code?.toUpperCase(),
                    illCount != null && illCount > 1 ? `${illCount} illustrations` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {card.cheapest_price != null && (
                  <span className="text-base text-green-400 font-bold">${card.cheapest_price.toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right arrow */}
        {onNext ? (
          <button
            onClick={onNext}
            className="hidden md:block p-2 text-white/20 hover:text-white/60 transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : <div className="hidden md:block w-12" />}
      </div>
    </div>,
    document.body
  );
}
