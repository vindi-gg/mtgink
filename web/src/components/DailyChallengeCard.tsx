"use client";

import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import type { DailyChallengeWithStatus } from "@/lib/types";

interface DailyChallengeCardProps {
  challenge: DailyChallengeWithStatus;
}

// Angled clip-path polygons for 5 diagonal slices
// Each slice is a parallelogram that skews ~8% for the angle effect
const SLICE_CLIPS = [
  "polygon(0% 0%, 28% 0%, 20% 100%, 0% 100%)",
  "polygon(20% 0%, 48% 0%, 40% 100%, 12% 100%)",
  "polygon(40% 0%, 68% 0%, 60% 100%, 32% 100%)",
  "polygon(60% 0%, 88% 0%, 80% 100%, 52% 100%)",
  "polygon(80% 0%, 100% 0%, 100% 100%, 72% 100%)",
];

export default function DailyChallengeCard({ challenge }: DailyChallengeCardProps) {
  const href = `/daily/${challenge.challenge_type}`;

  // Pull up to 5 arts from the pool for the sliced background
  const pool = challenge.pool ?? [];
  const sliceArts = pool.slice(0, 5).map((entry) =>
    artCropUrl(entry.set_code, entry.collector_number, null)
  );

  // Fallback to single preview if pool is empty
  const hasPreview = challenge.preview_set_code && challenge.preview_collector_number;
  if (sliceArts.length === 0 && hasPreview) {
    sliceArts.push(
      artCropUrl(challenge.preview_set_code!, challenge.preview_collector_number!, challenge.preview_image_version)
    );
  }

  return (
    <Link
      href={href}
      className="relative block rounded-xl overflow-hidden ring-1 ring-amber-500/30 hover:ring-2 hover:ring-amber-500 transition-all group"
    >
      {/* Sliced art background */}
      <div className="w-full aspect-[16/9] overflow-hidden bg-gray-800 relative">
        {sliceArts.length >= 5 ? (
          // 5 angled slices
          sliceArts.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              style={{ clipPath: SLICE_CLIPS[i] }}
            />
          ))
        ) : sliceArts.length > 0 ? (
          // Single fallback image
          <img
            src={sliceArts[0]}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : null}
      </div>

      {/* Gradient overlay — heavier on left for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-gray-950/90 via-gray-950/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-transparent" />

      {/* Overlayed content — left-aligned */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
        {challenge.participated && (
          <span className="text-[10px] text-green-400 font-medium uppercase tracking-wider">Completed</span>
        )}
        <h3 className="text-xl md:text-2xl font-bold text-amber-400 leading-tight">
          {challenge.title}
        </h3>
        <p className="text-sm text-gray-300 mt-1">
          Art showdown in today&apos;s MTG Ink Gauntlet
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {challenge.stats.participation_count.toLocaleString()} played today
        </p>
      </div>
    </Link>
  );
}
