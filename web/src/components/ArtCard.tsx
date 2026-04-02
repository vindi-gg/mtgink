"use client";

import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import FavoriteButton from "./FavoriteButton";
import type { Illustration, ArtRating } from "@/lib/types";

interface ArtCardProps {
  illustration: Illustration;
  rating: ArtRating | null;
  rank: number;
  oracleId: string;
  isFavorited: boolean;
  onFavoriteToggle: (illustrationId: string, oracleId: string) => Promise<string | null>;
  onImageClick?: () => void;
}

export default function ArtCard({
  illustration,
  rating,
  rank,
  oracleId,
  isFavorited,
  onFavoriteToggle,
  onImageClick,
}: ArtCardProps) {
  const src = artCropUrl(illustration.set_code, illustration.collector_number, illustration.image_version);

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
      <div className="relative">
        <img
          src={src}
          alt={`Art by ${illustration.artist}`}
          className="w-full aspect-[4/3] object-cover cursor-pointer"
          loading="lazy"
          onClick={onImageClick}
        />
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
        {illustration.cheapest_price != null && (
          <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-green-400 text-xs font-bold px-2 py-1 rounded-md">
            ${illustration.cheapest_price.toFixed(2)}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-200">
          {illustration.artist}
        </p>
        <p className="text-xs text-gray-400">
          <Link href={`/db/expansions/${illustration.set_code}`} className="hover:text-amber-400 transition-colors">{illustration.set_name}</Link> ({illustration.set_code.toUpperCase()})
        </p>
      </div>
    </div>
  );
}
