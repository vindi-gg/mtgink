"use client";

import { useState } from "react";
import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import FavoriteButton from "./FavoriteButton";
import ArtLightbox from "./ArtLightbox";
import type { Illustration, ArtRating } from "@/lib/types";

interface ArtCardProps {
  illustration: Illustration;
  rating: ArtRating | null;
  rank: number;
  oracleId: string;
  isFavorited: boolean;
  onFavoriteToggle: (illustrationId: string, oracleId: string) => Promise<string | null>;
}

export default function ArtCard({
  illustration,
  rating,
  rank,
  oracleId,
  isFavorited,
  onFavoriteToggle,
}: ArtCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = artCropUrl(illustration.set_code, illustration.collector_number, illustration.image_version);

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
      <div className="relative">
        <img
          src={src}
          alt={`Art by ${illustration.artist}`}
          className="w-full aspect-[4/3] object-cover cursor-pointer"
          loading="lazy"
          onClick={() => setLightboxOpen(true)}
        />
        {lightboxOpen && (
          <ArtLightbox
            setCode={illustration.set_code}
            collectorNumber={illustration.collector_number}
            imageVersion={illustration.image_version}
            alt={`Art by ${illustration.artist}`}
            onClose={() => setLightboxOpen(false)}
          />
        )}
        <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs font-bold">
          #{rank}
        </div>
        <div className="absolute top-2 right-2">
          <FavoriteButton
            illustrationId={illustration.illustration_id}
            oracleId={oracleId}
            isFavorited={isFavorited}
            onToggle={onFavoriteToggle}
            size="sm"
          />
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-200">
          {illustration.artist}
        </p>
        <p className="text-xs text-gray-400">
          <Link href={`/db/expansions/${illustration.set_code}`} className="hover:text-amber-400 transition-colors">{illustration.set_name}</Link> ({illustration.set_code.toUpperCase()})
        </p>
        {rating && (
          <p className="text-xs text-gray-500 mt-1">
            {rating.vote_count} votes &middot; {rating.win_count}W-
            {rating.loss_count}L
          </p>
        )}
      </div>
    </div>
  );
}
