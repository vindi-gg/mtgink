"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { artCropUrl } from "@/lib/image-utils";

interface ArtLightboxProps {
  setCode: string;
  collectorNumber: string;
  imageVersion?: string | null;
  alt: string;
  onClose: () => void;
}

export default function ArtLightbox({ setCode, collectorNumber, imageVersion, alt, onClose }: ArtLightboxProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80" />
      <img
        src={artCropUrl(setCode, collectorNumber, imageVersion)}
        alt={alt}
        className="relative max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
