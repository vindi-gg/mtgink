"use client";

import { useState, useRef, useEffect } from "react";

interface CardImageProps {
  src: string;
  alt: string;
  onClick?: () => void;
  className?: string;
}

export default function CardImage({
  src,
  alt,
  onClick,
  className = "",
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Handle images that loaded before React hydrated
  useEffect(() => {
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
    >
      {!loaded && (
        <div className="absolute inset-0 bg-gray-800 animate-pulse rounded-lg" />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`w-full h-auto transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />
    </button>
  );
}
