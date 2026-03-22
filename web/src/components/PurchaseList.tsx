"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import type { PurchaseListItem } from "@/lib/types";

export default function PurchaseList() {
  const [items, setItems] = useState<PurchaseListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deck/purchases")
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleRemove(item: PurchaseListItem) {
    const res = await fetch(
      `/api/deck/${item.deck_id}/card/${item.oracle_id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_buy: false }),
      }
    );
    if (res.ok) {
      setItems((prev) =>
        prev.filter(
          (i) =>
            !(i.deck_id === item.deck_id && i.oracle_id === item.oracle_id)
        )
      );
    }
  }

  if (loading) {
    return (
      <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-2">No items in your purchase list.</p>
        <p className="text-xs text-gray-600">
          Mark cards as &quot;To Buy&quot; in any deck to see them here.
        </p>
      </div>
    );
  }

  // Group by deck
  const grouped = new Map<string, PurchaseListItem[]>();
  for (const item of items) {
    if (!grouped.has(item.deck_id)) grouped.set(item.deck_id, []);
    grouped.get(item.deck_id)!.push(item);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([deckId, deckItems]) => (
        <div key={deckId}>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
            {deckItems[0].deck_name}
          </h3>
          <div className="space-y-2">
            {deckItems.map((item) => (
              <div
                key={`${item.deck_id}-${item.oracle_id}`}
                className="flex items-center gap-3 border border-gray-800 rounded-lg px-3 py-2"
              >
                {item.set_code && item.collector_number && (
                  <img
                    src={artCropUrl(item.set_code, item.collector_number, item.image_version)}
                    alt=""
                    className="w-12 h-9 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/card/${item.card_slug}`}
                    className="text-sm font-medium text-gray-200 hover:text-amber-400 transition-colors"
                  >
                    {item.card_name}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {item.artist} &middot; {item.set_code.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.tcgplayer_id && (
                    <a
                      href={`https://www.tcgplayer.com/product/${item.tcgplayer_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 transition-colors"
                    >
                      Buy
                    </a>
                  )}
                  <button
                    onClick={() => handleRemove(item)}
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
                    title="Remove from list"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
