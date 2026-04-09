"use client";

import { useState, useEffect } from "react";
import { normalCardUrl } from "@/lib/image-utils";
import FavoriteButton from "./FavoriteButton";

interface CardPreviewOverlayProps {
  setCode: string;
  collectorNumber: string;
  imageVersion: string | null;
  alt?: string;
  // Optional props for enhanced mobile modal
  illustrationId?: string;
  oracleId?: string;
  cardName?: string;
  cardSlug?: string;
  isFavorited?: boolean;
  onToggleFavorite?: (illustrationId: string, oracleId: string) => Promise<string | null>;
}

export default function CardPreviewOverlay({
  setCode,
  collectorNumber,
  imageVersion,
  alt,
  illustrationId,
  oracleId,
  cardName,
  cardSlug,
  isFavorited,
  onToggleFavorite,
}: CardPreviewOverlayProps) {
  const [showing, setShowing] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [priceLoaded, setPriceLoaded] = useState(false);

  // Reset price when the illustration changes
  useEffect(() => {
    setPrice(null);
    setPriceLoaded(false);
  }, [illustrationId]);

  const cardSrc = normalCardUrl(setCode, collectorNumber, imageVersion);

  // Fetch cheapest price for this illustration when overlay opens
  useEffect(() => {
    if (!showing || priceLoaded) return;

    const params = new URLSearchParams();
    if (illustrationId) {
      params.set("illustration_id", illustrationId);
    } else if (oracleId) {
      params.set("oracle_id", oracleId);
    } else {
      return;
    }

    fetch(`/api/prices?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0 && data[0].market_price) {
          setPrice(`$${Number(data[0].market_price).toFixed(2)}`);
        }
        setPriceLoaded(true);
      })
      .catch(() => setPriceLoaded(true));
  }, [showing, priceLoaded, illustrationId, oracleId]);

  return (
    <>
      <button
        type="button"
        className="absolute bottom-2 left-2 z-30 w-8 h-10 rounded bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-zoom-in hover:bg-black/60 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          if (window.innerWidth >= 768 && cardSlug) {
            window.open(`/card/${cardSlug}`, "_blank");
          } else {
            setShowing(true);
          }
        }}
        onPointerEnter={(e) => {
          if (window.innerWidth >= 768) {
            setShowing(true);
            setCursorPos({ x: e.clientX, y: e.clientY });
          }
        }}
        onPointerMove={(e) => {
          if (window.innerWidth >= 768) setCursorPos({ x: e.clientX, y: e.clientY });
        }}
        onPointerLeave={() => {
          if (window.innerWidth >= 768) { setShowing(false); setCursorPos(null); }
        }}
      >
        <svg width="16" height="20" viewBox="0 0 16 20" fill="none" className="text-white/70">
          <rect x="1" y="1" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="3.5" y="3.5" width="9" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
          <line x1="3.5" y1="12" x2="12.5" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          <line x1="3.5" y1="14.5" x2="10" y2="14.5" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        </svg>
      </button>

      {/* Mobile card preview modal — enhanced with favorite + price */}
      {showing && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-6 animate-fade-in md:hidden"
          onClick={() => setShowing(false)}
        >
          <div className="relative max-w-[320px] w-full">
            <img src={cardSrc} alt={alt ?? "Card preview"} className="w-full rounded-[3.8%]" onClick={() => setShowing(false)} />

            {/* Info bar below card */}
            {(illustrationId || cardName || price) && (
              <div className="flex items-center justify-between mt-3 px-1" onClick={(e) => e.stopPropagation()}>
                <div className="min-w-0">
                  {cardName && cardSlug ? (
                    <a
                      href={`/card/${cardSlug}`}
                      className="text-sm font-bold text-amber-400 hover:text-amber-300 truncate block"
                    >
                      {cardName}
                    </a>
                  ) : cardName ? (
                    <span className="text-sm font-bold text-gray-200 truncate block">{cardName}</span>
                  ) : null}
                  {price && (
                    <span className="text-xs text-gray-400">from {price}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {illustrationId && oracleId && onToggleFavorite && (
                    <FavoriteButton
                      illustrationId={illustrationId}
                      oracleId={oracleId}
                      isFavorited={isFavorited ?? false}
                      onToggle={onToggleFavorite}
                    />
                  )}
                  <button
                    onClick={() => setShowing(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop card preview — follows cursor */}
      {showing && cursorPos && (
        <div
          className="fixed z-50 pointer-events-none hidden md:block"
          style={{
            left: cursorPos.x + 20,
            top: Math.min(cursorPos.y - 200, typeof window !== "undefined" ? window.innerHeight - 520 : 300),
            width: 336,
          }}
        >
          <img src={cardSrc} alt={alt ?? "Card preview"} className="w-full rounded-[3.8%] shadow-2xl shadow-black/80" />
          {price && (
            <div className="mt-1.5 text-center">
              <span className="text-sm font-medium text-gray-200 bg-gray-900/90 px-2.5 py-1 rounded-lg">
                {price}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
