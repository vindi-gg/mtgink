"use client";

import { useState } from "react";

interface CardFaceToggleProps {
  /** Front face image URL (local CDN) */
  frontSrc: string;
  /** Back face image URL (Scryfall CDN fallback) */
  backSrc: string;
  alt: string;
  className?: string;
  /** If true, clicking the image itself also flips (default: false) */
  clickToFlip?: boolean;
}

/**
 * Wraps a card image with a flip button overlay.
 * The flip icon swaps between front and back face.
 */
export default function CardFaceToggle({ frontSrc, backSrc, alt, className, clickToFlip }: CardFaceToggleProps) {
  const [showBack, setShowBack] = useState(false);

  return (
    <div className={`relative group ${className ?? ""}`}>
      <img
        src={showBack ? backSrc : frontSrc}
        alt={alt}
        className={`w-full rounded-lg ${clickToFlip ? "cursor-pointer" : ""}`}
        loading="lazy"
        onClick={clickToFlip ? (e) => { e.stopPropagation(); e.preventDefault(); setShowBack(!showBack); } : undefined}
      />
      {/* Flip button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setShowBack(!showBack);
        }}
        className="absolute top-2 right-2 z-30 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 md:opacity-0 max-md:opacity-70"
        title="Flip card"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      </button>
    </div>
  );
}
