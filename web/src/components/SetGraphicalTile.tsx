"use client";

import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import type { MtgSet } from "@/lib/types";

type Size = "sm" | "lg";

const HEIGHT_CLASS: Record<Size, string> = {
  sm: "h-16",
  lg: "h-20 sm:h-28",
};

interface Props {
  set: MtgSet;
  /** True when this tile represents the page's current set; click is suppressed. */
  isActive?: boolean;
  /** When provided, renders as a Link. Otherwise, onClick is required (button). */
  href?: string;
  onClick?: () => void;
  /** Size of the tile. "sm" suits modal grids; "lg" suits the homepage row. */
  size?: Size;
  /** Whether to show the year suffix next to the set code. */
  showYear?: boolean;
  /** Explicit subtitle overrides showYear. */
  subtitle?: string;
}

export default function SetGraphicalTile({
  set,
  isActive,
  href,
  onClick,
  size = "lg",
  showYear = false,
  subtitle,
}: Props) {
  const bg = set.hero_set_code && set.hero_collector_number
    ? artCropUrl(set.hero_set_code, set.hero_collector_number, set.hero_image_version)
    : null;

  const className = `group relative block w-full text-left ${HEIGHT_CLASS[size]} rounded-lg overflow-hidden border transition-colors ${
    isActive
      ? "border-amber-500/60 ring-1 ring-amber-500/40 pointer-events-none"
      : "border-gray-800 hover:border-gray-700 cursor-pointer"
  }`;

  const inner = (
    <>
      {bg ? (
        <img
          src={bg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gray-950 flex items-center justify-center">
          {set.icon_svg_uri && (
            <img src={set.icon_svg_uri} alt="" className="w-10 h-10 invert opacity-25" />
          )}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      {set.illustration_count && set.illustration_count > 0 ? (
        <div className="absolute top-2 right-2 text-[10px] uppercase tracking-wide text-gray-200/90 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {set.illustration_count} art
        </div>
      ) : null}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center gap-2">
        {set.icon_svg_uri && (
          <img
            src={set.icon_svg_uri}
            alt=""
            className="w-4 h-4 invert opacity-90 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {set.name}
          </p>
          {subtitle ? (
            <p className="text-[10px] uppercase tracking-wide text-gray-200/90 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {subtitle}
            </p>
          ) : showYear ? (
            <p className="text-[10px] uppercase tracking-wide text-gray-200/90 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {set.set_code}
              {set.released_at ? ` · ${set.released_at.slice(0, 4)}` : ""}
            </p>
          ) : null}
        </div>
        {set.is_preview && (
          <span className="text-[9px] uppercase tracking-wide text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded shrink-0">
            Preview
          </span>
        )}
      </div>
    </>
  );

  if (href && !onClick) {
    return (
      <Link href={href} className={className} aria-disabled={isActive || undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={isActive} className={className}>
      {inner}
    </button>
  );
}
