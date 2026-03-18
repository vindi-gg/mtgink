"use client";

import { useState } from "react";
import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import { useImageMode } from "@/lib/image-mode";
import type { ArtistIllustration } from "@/lib/types";

const PAGE_SIZE = 24;

export default function ArtistGallery({
  illustrations,
}: {
  illustrations: ArtistIllustration[];
}) {
  const { cardUrl } = useImageMode();
  const [visible, setVisible] = useState(PAGE_SIZE);

  const hasMore = visible < illustrations.length;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {illustrations.slice(0, visible).map((ill) => (
          <Link
            key={ill.illustration_id}
            href={`/card/${ill.card_slug}`}
            className="group bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-amber-500/50 transition-colors"
          >
            <div className="aspect-[4/3] bg-gray-800 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardUrl(ill.set_code, ill.collector_number, ill.image_version)}
                alt={ill.card_name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-white truncate">
                {ill.card_name}
              </p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-gray-500 truncate">
                  {ill.set_name}
                </span>
                {ill.elo_rating != null && (
                  <span className="text-xs text-amber-400 flex-shrink-0 ml-1">
                    {Math.round(ill.elo_rating)}
                  </span>
                )}
              </div>
            </div>
          </Link>
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
    </>
  );
}
