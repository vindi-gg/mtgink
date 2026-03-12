"use client";

import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import type { DailyChallengeWithStatus } from "@/lib/types";

interface DailyChallengeCardProps {
  challenge: DailyChallengeWithStatus;
}

const TYPE_LABELS: Record<string, string> = {
  remix: "Remix",
  vs: "VS",
  gauntlet: "Gauntlet",
};

const GAUNTLET_MODE_LABELS: Record<string, string> = {
  remix: "Remix Gauntlet",
  vs: "VS Gauntlet",
};

const TYPE_COLORS: Record<string, string> = {
  remix: "bg-amber-500 text-gray-900",
  vs: "bg-blue-500 text-white",
  gauntlet: "bg-red-500 text-white",
};

export default function DailyChallengeCard({ challenge }: DailyChallengeCardProps) {
  const href = `/daily/${challenge.challenge_type}`;
  const hasPreview = challenge.preview_set_code && challenge.preview_collector_number;

  return (
    <Link
      href={href}
      className="relative border border-gray-700 rounded-xl overflow-hidden transition-all hover:border-amber-500 hover:bg-gray-900/50 group flex sm:block"
    >
      {/* Preview image */}
      {hasPreview && (
        <div className="w-24 shrink-0 sm:w-full aspect-square sm:aspect-[626/457] overflow-hidden bg-gray-800">
          <img
            src={artCropUrl(
              challenge.preview_set_code!,
              challenge.preview_collector_number!,
              challenge.preview_image_version,
            )}
            alt={challenge.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-3 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TYPE_COLORS[challenge.challenge_type]}`}>
            {challenge.challenge_type === "gauntlet" && challenge.gauntlet_mode
              ? GAUNTLET_MODE_LABELS[challenge.gauntlet_mode] ?? "Gauntlet"
              : TYPE_LABELS[challenge.challenge_type]}
          </span>
          {challenge.participated && (
            <span className="text-[10px] text-green-400 font-medium">Done</span>
          )}
        </div>
        <h3 className="text-sm font-bold text-white truncate">{challenge.title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {challenge.stats.participation_count.toLocaleString()} today
        </p>
      </div>
    </Link>
  );
}
