"use client";

import Link from "next/link";
import { PLAY_MODES, PlayModeIcon } from "@/lib/play-modes";

const MODES = PLAY_MODES.filter((m) =>
  !m.label.startsWith("Daily") && m.label !== "Brews"
);

interface ModeCardsProps {
  images?: string[];
}

export default function ModeCards({ images = [] }: ModeCardsProps) {

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 gap-2">
        {MODES.map((mode, i) => {
          const bgImage = images[i];
          return (
            <Link
              key={mode.href}
              href={mode.href}
              rel="nofollow"
              className="relative block border border-amber-500/30 rounded-xl overflow-hidden hover:border-amber-500/60 transition-colors group"
            >
              {bgImage && (
                <img
                  src={bgImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-25 scale-105 group-hover:scale-110 transition-transform duration-500"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/70 to-gray-950/40" />
              <div className="relative px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PlayModeIcon d={mode.icon} className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white text-left">{mode.label}</h3>
                    <p className="text-xs text-gray-400 truncate text-left">{mode.desc}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 items-center">
                  {/* Play button — same as clicking the card */}
                  <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-gray-900 whitespace-nowrap">
                    <svg className="w-3.5 h-3.5 inline-block -mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  {"createHref" in mode && mode.createHref && (
                    <Link
                      href={mode.createHref}
                      rel="nofollow"
                      onClick={(e) => e.stopPropagation()}
                      className="relative z-10 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-600 text-gray-300 hover:border-amber-500 hover:text-white transition-colors whitespace-nowrap"
                    >
                      Brew
                    </Link>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
