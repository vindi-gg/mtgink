"use client";

import { useState } from "react";
import { useImageMode } from "@/lib/image-mode";
import CardLightbox from "./CardLightbox";
import type { ArtistIllustration } from "@/lib/types";
import type { BrowseCard } from "@/lib/types";

const PAGE_SIZE = 24;

function toBrowseCard(ill: ArtistIllustration): BrowseCard {
  return {
    oracle_id: ill.oracle_id,
    name: ill.card_name,
    slug: ill.card_slug,
    type_line: null,
    mana_cost: null,
    set_code: ill.set_code,
    collector_number: ill.collector_number,
    image_version: ill.image_version,
  };
}

export default function ArtistGallery({
  illustrations,
}: {
  illustrations: ArtistIllustration[];
}) {
  const { cardUrl, imageMode } = useImageMode();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const hasMore = visible < illustrations.length;
  const shown = illustrations.slice(0, visible);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {shown.map((ill, i) => (
          <button
            key={ill.illustration_id}
            onClick={() => setLightboxIdx(i)}
            className="group relative text-left cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cardUrl(ill.set_code, ill.collector_number, ill.image_version)}
              alt={ill.card_name}
              className="w-full rounded-lg border border-gray-800 group-hover:border-amber-500/50 transition-colors"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="px-6 py-2.5 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Show more ({illustrations.length - visible} remaining)
          </button>
        </div>
      )}

      {lightboxIdx !== null && lightboxIdx < shown.length && (
        <CardLightbox
          card={toBrowseCard(shown[lightboxIdx])}
          imageUrl={cardUrl(shown[lightboxIdx].set_code, shown[lightboxIdx].collector_number, shown[lightboxIdx].image_version)}
          index={lightboxIdx}
          total={shown.length}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined}
          onNext={lightboxIdx < shown.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : undefined}
        />
      )}
    </>
  );
}
