"use client";

import { useState } from "react";
import { normalCardUrl } from "@/lib/image-utils";

interface CardPreviewOverlayProps {
  setCode: string;
  collectorNumber: string;
  imageVersion: string | null;
  alt?: string;
}

export default function CardPreviewOverlay({ setCode, collectorNumber, imageVersion, alt }: CardPreviewOverlayProps) {
  const [showing, setShowing] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const cardSrc = normalCardUrl(setCode, collectorNumber, imageVersion);

  return (
    <>
      <button
        type="button"
        className="absolute bottom-2 left-2 z-30 w-8 h-10 rounded bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-zoom-in hover:bg-black/60 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setShowing(true);
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

      {/* Mobile card preview modal */}
      {showing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-fade-in md:hidden"
          onClick={() => setShowing(false)}
        >
          <img src={cardSrc} alt={alt ?? "Card preview"} className="max-h-[85vh] max-w-full rounded-[3.8%]" />
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
        </div>
      )}
    </>
  );
}
