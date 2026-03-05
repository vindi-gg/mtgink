"use client";

import ArtCard from "./ArtCard";
import { useFavorites } from "@/hooks/useFavorites";
import type { Illustration, ArtRating } from "@/lib/types";

interface IllustrationWithRating extends Illustration {
  rating: ArtRating | null;
}

interface ArtGalleryProps {
  illustrations: IllustrationWithRating[];
  oracleId: string;
}

export default function ArtGallery({ illustrations, oracleId }: ArtGalleryProps) {
  const { favorites, toggle } = useFavorites(
    illustrations.map((ill) => ill.illustration_id)
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {illustrations.map((ill, i) => (
        <ArtCard
          key={ill.illustration_id}
          illustration={ill}
          rating={ill.rating}
          rank={i + 1}
          oracleId={oracleId}
          isFavorited={favorites.has(ill.illustration_id)}
          onFavoriteToggle={toggle}
        />
      ))}
    </div>
  );
}
