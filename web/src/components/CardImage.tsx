"use client";

import { useState, useRef, useEffect } from "react";

interface CardImageProps {
  src: string;
  alt: string;
  onClick?: (e: React.MouseEvent) => void;
  onImageError?: () => void;
  className?: string;
}

export default function CardImage({
  src,
  alt,
  onClick,
  onImageError,
  className = "",
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state when src changes
  useEffect(() => {
    setErrored(false);
    setLoaded(false);
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative overflow-hidden rounded-[3.8%] block w-full ${onClick ? "cursor-pointer hover:ring-4 hover:ring-amber-400 transition-all active:scale-[0.98]" : ""} ${className}`}
      style={{ aspectRatio: "626 / 457" }}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 bg-gray-800 animate-pulse rounded-lg" />
      )}
      {errored && (
        <div className="absolute inset-0 bg-gray-800 rounded-lg flex items-center justify-center">
          <span className="text-gray-500 text-xs">Image unavailable</span>
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`w-full h-auto transition-opacity duration-300 ${loaded && !errored ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true); onImageError?.(); }}
        draggable={false}
      />
    </button>
  );
}
