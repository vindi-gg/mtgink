"use client";

import { useEffect, useState } from "react";
import SetArtTile from "./SetArtTile";
import CardLightbox from "./CardLightbox";
import { artCropUrl, largeCardUrl } from "@/lib/image-utils";
import type { SetIllustration, SetArtSort } from "@/lib/types";

const PAGE_SIZE = 60;

interface Props {
  /** Endpoint that returns SetArtPage when called with ?sort & ?offset & ?limit. */
  apiPath: string;
  sort: SetArtSort;
  initial: SetIllustration[];
  total: number;
}

export default function SetArtListing({ apiPath, sort, initial, total }: Props) {
  const [items, setItems] = useState<SetIllustration[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    setItems(initial);
    setError(null);
    setLightboxIdx(null);
  }, [initial, apiPath, sort]);

  const hasMore = items.length < total;

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const sep = apiPath.includes("?") ? "&" : "?";
      const res = await fetch(
        `${apiPath}${sep}sort=${sort}&limit=${PAGE_SIZE}&offset=${items.length}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { illustrations: SetIllustration[]; total: number } = await res.json();
      setItems((prev) => [...prev, ...data.illustrations]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-center text-gray-500 py-16">
        No art found for this set.
      </div>
    );
  }

  const lightboxIll = lightboxIdx !== null ? items[lightboxIdx] : null;

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        {items.map((ill, i) => (
          <SetArtTile
            key={ill.illustration_id}
            illustration={ill}
            onClick={() => setLightboxIdx(i)}
            showPrice={sort === "price"}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center gap-2">
        {hasMore ? (
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-6 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 hover:border-amber-500/50 rounded-lg text-sm font-medium text-gray-200 transition-colors cursor-pointer"
          >
            {loading ? "Loading..." : `Load more (${total - items.length} remaining)`}
          </button>
        ) : (
          <p className="text-xs text-gray-500">Showing all {total} illustrations</p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {lightboxIll && lightboxIdx !== null && (
        <CardLightbox
          card={{
            oracle_id: lightboxIll.oracle_id,
            name: lightboxIll.card_name,
            slug: lightboxIll.card_slug,
            type_line: null,
            mana_cost: null,
            set_code: lightboxIll.set_code,
            collector_number: lightboxIll.collector_number,
            image_version: lightboxIll.image_version,
            cheapest_price: lightboxIll.cheapest_price,
          }}
          imageUrl={
            lightboxIll.is_full_art
              ? largeCardUrl(lightboxIll.set_code, lightboxIll.collector_number, lightboxIll.image_version)
              : artCropUrl(lightboxIll.set_code, lightboxIll.collector_number, lightboxIll.image_version)
          }
          index={lightboxIdx}
          total={items.length}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined}
          onNext={lightboxIdx < items.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : undefined}
        />
      )}
    </>
  );
}
