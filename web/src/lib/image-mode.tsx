"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { artCropUrl, normalCardUrl } from "./image-utils";

type ImageMode = "art" | "card";

interface ImageModeContextValue {
  imageMode: ImageMode;
  toggleImageMode: () => void;
  cardUrl: (setCode: string, collectorNumber: string, version?: string | null) => string;
}

const ImageModeContext = createContext<ImageModeContextValue>({
  imageMode: "art",
  toggleImageMode: () => {},
  cardUrl: artCropUrl,
});

const STORAGE_KEY = "mtgink_image_mode";

export function ImageModeProvider({ children }: { children: React.ReactNode }) {
  const [imageMode, setImageMode] = useState<ImageMode>("art");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "card") setImageMode("card");
  }, []);

  const toggleImageMode = useCallback(() => {
    setImageMode((prev) => {
      const next = prev === "art" ? "card" : "art";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const cardUrl = useCallback(
    (setCode: string, collectorNumber: string, version?: string | null) =>
      imageMode === "card"
        ? normalCardUrl(setCode, collectorNumber, version)
        : artCropUrl(setCode, collectorNumber, version),
    [imageMode],
  );

  return (
    <ImageModeContext.Provider value={{ imageMode, toggleImageMode, cardUrl }}>
      {children}
    </ImageModeContext.Provider>
  );
}

export function useImageMode() {
  return useContext(ImageModeContext);
}

/** Bind "W" to toggle art ↔ card image mode. Call this in surfaces where
 *  the toggle is meaningful (showdown / gauntlet voting). Outside of those,
 *  the shortcut would silently swap browse-mode imagery and surprise users. */
export function useImageModeKeybinding() {
  const { toggleImageMode } = useImageMode();
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "w" || e.key === "W") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        toggleImageMode();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleImageMode]);
}
