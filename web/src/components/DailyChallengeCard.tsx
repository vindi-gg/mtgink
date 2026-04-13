"use client";

import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import type { DailyChallengeWithStatus } from "@/lib/types";

interface DailyChallengeCardProps {
  challenge: DailyChallengeWithStatus;
  /** Render at half height with smaller text — used for the gauntlet
   *  card when it sits below the daily bracket on the homepage. */
  compact?: boolean;
}

// Angled clip-path polygons for 5 diagonal slices
const SLICE_CLIPS = [
  "polygon(0% 0%, 28% 0%, 20% 100%, 0% 100%)",
  "polygon(20% 0%, 48% 0%, 40% 100%, 12% 100%)",
  "polygon(40% 0%, 68% 0%, 60% 100%, 32% 100%)",
  "polygon(60% 0%, 88% 0%, 80% 100%, 52% 100%)",
  "polygon(80% 0%, 100% 0%, 100% 100%, 72% 100%)",
];

// 3-slice variant for compact mode
const SLICE_CLIPS_3 = [
  "polygon(0% 0%, 40% 0%, 32% 100%, 0% 100%)",
  "polygon(30% 0%, 70% 0%, 62% 100%, 22% 100%)",
  "polygon(60% 0%, 100% 0%, 100% 100%, 52% 100%)",
];

const TYPE_LABELS: Record<string, string> = {
  bracket: "Daily Bracket",
  gauntlet: "Daily Gauntlet",
  remix: "Daily Remix",
  vs: "Daily VS",
};

function getTypeDescription(challenge: DailyChallengeWithStatus): string {
  if (challenge.challenge_type === "bracket") {
    const size = challenge.bracket_size ?? 16;
    return `${size}-card single-elimination tournament`;
  }
  const descs: Record<string, string> = {
    gauntlet: "King of the hill — winner stays!",
    remix: "Same card, pick the best art",
    vs: "Two cards go head to head",
  };
  return descs[challenge.challenge_type] ?? "Art showdown";
}

export default function DailyChallengeCard({
  challenge,
  compact = false,
}: DailyChallengeCardProps) {
  const href = `/daily/${challenge.challenge_type}`;

  const pool = challenge.pool ?? [];
  const maxSlices = compact ? 3 : 5;
  const clips = compact ? SLICE_CLIPS_3 : SLICE_CLIPS;
  const sliceArts = pool.slice(0, maxSlices).map((entry) =>
    artCropUrl(entry.set_code, entry.collector_number, null)
  );

  const hasPreview = challenge.preview_set_code && challenge.preview_collector_number;
  if (sliceArts.length === 0 && hasPreview) {
    sliceArts.push(
      artCropUrl(challenge.preview_set_code!, challenge.preview_collector_number!, challenge.preview_image_version)
    );
  }

  const typeLabel = TYPE_LABELS[challenge.challenge_type] ?? "Daily Challenge";
  const typeDesc = getTypeDescription(challenge);

  return (
    <Link
      href={href}
      className="relative block rounded-xl overflow-hidden ring-1 ring-amber-500/30 hover:ring-2 hover:ring-amber-500 transition-all group"
    >
      {/* Sliced art background */}
      <div className={`w-full overflow-hidden bg-gray-800 relative ${compact ? "aspect-[3/1]" : "aspect-[16/9]"}`}>
        {sliceArts.length >= clips.length ? (
          sliceArts.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              style={{ clipPath: clips[i] }}
            />
          ))
        ) : sliceArts.length > 0 ? (
          <img
            src={sliceArts[0]}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : null}
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-gray-950/90 via-gray-950/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-transparent" />

      {/* Content overlay */}
      <div className={`absolute bottom-0 left-0 right-0 ${compact ? "p-3" : "p-4 md:p-5"}`}>
        {challenge.participated && (
          <span className="text-[10px] text-green-400 font-medium uppercase tracking-wider">Completed</span>
        )}
        <h3 className={`font-bold text-amber-400 leading-tight ${compact ? "text-base" : "text-xl md:text-2xl"}`}>
          {challenge.title}
        </h3>
        <p className={`text-gray-300 mt-0.5 ${compact ? "text-xs" : "text-sm mt-1"}`}>
          {typeDesc}
        </p>
        <p className={`text-gray-500 ${compact ? "text-[10px] mt-0.5" : "text-xs mt-1"}`}>
          {challenge.stats.participation_count.toLocaleString()} played today
        </p>
      </div>
    </Link>
  );
}
