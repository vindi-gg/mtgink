"use client";

import { artCropUrl } from "@/lib/image-utils";
import CardPreviewOverlay from "./CardPreviewOverlay";
import type { SetIllustration } from "@/lib/types";

interface Props {
  illustration: SetIllustration;
  onClick: () => void;
  showPrice?: boolean;
}

export default function SetArtTile({ illustration, onClick, showPrice = false }: Props) {
  const src = artCropUrl(illustration.set_code, illustration.collector_number, illustration.image_version);
  return (
    <div className="group relative block w-full overflow-hidden rounded-lg border border-gray-800 bg-gray-900 hover:border-amber-500/50 transition-colors">
      <button
        type="button"
        onClick={onClick}
        className="block w-full cursor-pointer"
      >
        <img
          src={src}
          alt={`${illustration.card_name} — art by ${illustration.artist}`}
          className="w-full aspect-[4/3] object-cover"
          loading="lazy"
        />
      </button>

      <CardPreviewOverlay
        setCode={illustration.set_code}
        collectorNumber={illustration.collector_number}
        imageVersion={illustration.image_version}
        alt={`${illustration.card_name} by ${illustration.artist}`}
        illustrationId={illustration.illustration_id}
        oracleId={illustration.oracle_id}
        cardName={illustration.card_name}
        cardSlug={illustration.card_slug}
        previewSide="left"
      />

      <div className="absolute bottom-2 right-2 z-10 text-right pointer-events-none">
        <p className="text-sm font-bold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] truncate max-w-[16rem]">
          {illustration.card_name}
        </p>
        <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] truncate max-w-[16rem]">
          {illustration.artist}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {illustration.set_code}
        </p>
      </div>

      {showPrice && illustration.cheapest_price != null && (
        <div className="absolute top-2 right-2 z-10 bg-black/60 backdrop-blur-sm text-green-400 text-xs font-bold px-2 py-1 rounded-md pointer-events-none">
          ${illustration.cheapest_price.toFixed(2)}
        </div>
      )}
    </div>
  );
}
