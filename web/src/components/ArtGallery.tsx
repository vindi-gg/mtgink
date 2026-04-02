"use client";

import { useState } from "react";
import ArtCard from "./ArtCard";
import CardLightbox from "./CardLightbox";
import { useFavorites } from "@/hooks/useFavorites";
import { useImageMode } from "@/lib/image-mode";
import type { Illustration, ArtRating } from "@/lib/types";

interface IllustrationWithRating extends Illustration {
  rating: ArtRating | null;
}

interface ArtGalleryProps {
  illustrations: IllustrationWithRating[];
  oracleId: string;
  cardName?: string;
  cardSlug?: string;
  typeLine?: string | null;
}

export default function ArtGallery({ illustrations, oracleId, cardName, cardSlug, typeLine }: ArtGalleryProps) {
  const { favorites, toggle } = useFavorites(
    illustrations.map((ill) => ill.illustration_id)
  );
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const { cardUrl } = useImageMode();

  const lightboxIll = lightboxIdx !== null ? illustrations[lightboxIdx] : null;

  return (
    <>
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
            onImageClick={() => setLightboxIdx(i)}
          />
        ))}
      </div>

      {lightboxIll && cardName && cardSlug && (
        <CardLightbox
          card={{
            oracle_id: oracleId,
            name: cardName,
            slug: cardSlug,
            type_line: typeLine ?? null,
            mana_cost: null,
            set_code: lightboxIll.set_code,
            collector_number: lightboxIll.collector_number,
            image_version: lightboxIll.image_version,
            cheapest_price: lightboxIll.cheapest_price,
            illustration_count: illustrations.length,
          }}
          imageUrl={cardUrl(lightboxIll.set_code, lightboxIll.collector_number, lightboxIll.image_version)}
          index={lightboxIdx!}
          total={illustrations.length}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx! > 0 ? () => setLightboxIdx(lightboxIdx! - 1) : undefined}
          onNext={lightboxIdx! < illustrations.length - 1 ? () => setLightboxIdx(lightboxIdx! + 1) : undefined}
        />
      )}
    </>
  );
}
