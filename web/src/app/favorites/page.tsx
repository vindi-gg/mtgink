"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FavoriteButton from "@/components/FavoriteButton";
import type { FavoriteEntry, FavoriteSource } from "@/lib/types";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";

interface CardFavorite {
  oracle_id: string;
  name: string;
  slug: string;
  type_line: string | null;
  set_code: string;
  collector_number: string;
  image_version: string | null;
  artist: string;
  created_at: string;
}

type Tab = "ink" | "clash" | "cards";

const PAGE_SIZE = 50;

function FavoriteGrid({
  items,
  source,
  onUnfavorite,
}: {
  items: FavoriteEntry[];
  source: FavoriteSource;
  onUnfavorite: (illustrationId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-gray-500 text-sm">
        {source === "ink"
          ? "Tap the heart on any illustration in Ink to save it here."
          : "Tap the heart on any card in Clash to save it here."}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((fav) => (
        <div
          key={fav.illustration_id}
          className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800"
        >
          <div className="relative">
            <Link href={`/card/${fav.card_slug}`}>
              <img
                src={
                  source === "clash"
                    ? normalCardUrl(fav.set_code, fav.collector_number, fav.image_version)
                    : artCropUrl(fav.set_code, fav.collector_number, fav.image_version)
                }
                alt={`${fav.card_name} by ${fav.artist}`}
                className={`w-full ${source === "clash" ? "aspect-[488/680]" : "aspect-[4/3]"} object-cover`}
                loading="lazy"
              />
            </Link>
            <div className="absolute top-2 right-2">
              <FavoriteButton
                illustrationId={fav.illustration_id}
                oracleId={fav.oracle_id}
                isFavorited={true}
                onToggle={async (illustrationId) => {
                  onUnfavorite(illustrationId);
                  return null;
                }}
                size="sm"
              />
            </div>
          </div>
          <Link href={`/card/${fav.card_slug}`} className="block p-3">
            <p className="text-sm font-medium text-gray-200 truncate">
              {fav.card_name}
            </p>
            <p className="text-xs text-gray-400">{fav.artist}</p>
          </Link>
        </div>
      ))}
    </div>
  );
}

export default function FavoritesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [inkFavorites, setInkFavorites] = useState<FavoriteEntry[]>([]);
  const [clashFavorites, setClashFavorites] = useState<FavoriteEntry[]>([]);
  const [inkTotal, setInkTotal] = useState(0);
  const [clashTotal, setClashTotal] = useState(0);
  const [cardFavorites, setCardFavorites] = useState<CardFavorite[]>([]);
  const [cardTotal, setCardTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMoreInk, setLoadingMoreInk] = useState(false);
  const [loadingMoreClash, setLoadingMoreClash] = useState(false);
  const [loadingMoreCards, setLoadingMoreCards] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("ink");

  useEffect(() => {
    if (!supabase) {
      router.replace("/auth");
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/auth");
      } else {
        setAuthChecked(true);
      }
    });
  }, [supabase, router]);

  const fetchFavorites = useCallback(
    async (offset: number, source: FavoriteSource) => {
      const res = await fetch(
        `/api/favorites?limit=${PAGE_SIZE}&offset=${offset}&source=${source}`
      );
      if (!res.ok) return null;
      return res.json() as Promise<{
        favorites: FavoriteEntry[];
        total: number;
      }>;
    },
    []
  );

  const fetchCardFavorites = useCallback(
    async (offset: number) => {
      const res = await fetch(`/api/card-favorites?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) return null;
      return res.json() as Promise<{ cards: CardFavorite[]; total: number }>;
    },
    []
  );

  useEffect(() => {
    if (!authChecked) return;

    Promise.all([
      fetchFavorites(0, "ink"),
      fetchFavorites(0, "clash"),
      fetchCardFavorites(0),
    ]).then(([inkData, clashData, cardData]) => {
      if (inkData) {
        setInkFavorites(inkData.favorites);
        setInkTotal(inkData.total);
      }
      if (clashData) {
        setClashFavorites(clashData.favorites);
        setClashTotal(clashData.total);
      }
      if (cardData) {
        setCardFavorites(cardData.cards);
        setCardTotal(cardData.total);
      }
      setLoading(false);
    });
  }, [authChecked, fetchFavorites, fetchCardFavorites]);

  async function loadMore(source: FavoriteSource) {
    const current = source === "ink" ? inkFavorites : clashFavorites;
    const setLoadingMore = source === "ink" ? setLoadingMoreInk : setLoadingMoreClash;

    setLoadingMore(true);
    const data = await fetchFavorites(current.length, source);
    if (data) {
      if (source === "ink") {
        setInkFavorites((prev) => [...prev, ...data.favorites]);
        setInkTotal(data.total);
      } else {
        setClashFavorites((prev) => [...prev, ...data.favorites]);
        setClashTotal(data.total);
      }
    }
    setLoadingMore(false);
  }

  async function loadMoreCards() {
    setLoadingMoreCards(true);
    const data = await fetchCardFavorites(cardFavorites.length);
    if (data) {
      setCardFavorites((prev) => [...prev, ...data.cards]);
      setCardTotal(data.total);
    }
    setLoadingMoreCards(false);
  }

  async function handleUnfavorite(illustrationId: string, source: FavoriteSource) {
    const res = await fetch(`/api/favorites/${illustrationId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      if (source === "ink") {
        setInkFavorites((prev) => prev.filter((f) => f.illustration_id !== illustrationId));
        setInkTotal((prev) => prev - 1);
      } else {
        setClashFavorites((prev) => prev.filter((f) => f.illustration_id !== illustrationId));
        setClashTotal((prev) => prev - 1);
      }
    }
  }

  async function handleUnsaveCard(oracleId: string) {
    const res = await fetch("/api/card-favorites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oracle_id: oracleId }),
    });
    if (res.ok) {
      setCardFavorites((prev) => prev.filter((f) => f.oracle_id !== oracleId));
      setCardTotal((prev) => prev - 1);
    }
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-gray-400">Loading...</div>
        </div>
      </main>
    );
  }

  const totalAll = inkTotal + clashTotal + cardTotal;

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Favorites</h1>
        <p className="text-gray-400 mb-6">
          {totalAll > 0
            ? `${totalAll} favorite${totalAll !== 1 ? "s" : ""}`
            : "Your favorited art and cards will appear here."}
        </p>

        {/* Tab toggle */}
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          <button
            onClick={() => setActiveTab("ink")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "ink"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Art{inkTotal > 0 ? ` (${inkTotal})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("clash")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "clash"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Clash{clashTotal > 0 ? ` (${clashTotal})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("cards")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "cards"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Saved Cards{cardTotal > 0 ? ` (${cardTotal})` : ""}
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading favorites...</div>
        ) : activeTab === "cards" ? (
          <>
            {cardFavorites.length === 0 ? (
              <div className="text-gray-500 text-sm">
                Use the &quot;Save Card&quot; button on any card page to save it here.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {cardFavorites.map((card) => (
                  <div
                    key={card.oracle_id}
                    className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800"
                  >
                    <Link href={`/card/${card.slug}`}>
                      <img
                        src={artCropUrl(card.set_code, card.collector_number, card.image_version)}
                        alt={card.name}
                        className="w-full aspect-[4/3] object-cover"
                        loading="lazy"
                      />
                    </Link>
                    <div className="p-3 flex items-start justify-between gap-2">
                      <Link href={`/card/${card.slug}`} className="min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{card.name}</p>
                        <p className="text-xs text-gray-400 truncate">{card.type_line}</p>
                      </Link>
                      <button
                        onClick={() => handleUnsaveCard(card.oracle_id)}
                        className="text-amber-400 hover:text-red-400 text-xs shrink-0 transition-colors"
                        title="Remove"
                      >
                        ★
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cardFavorites.length < cardTotal && (
              <button
                onClick={loadMoreCards}
                disabled={loadingMoreCards}
                className="mt-6 w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-300 transition-colors disabled:opacity-50"
              >
                {loadingMoreCards ? "Loading..." : "Load more"}
              </button>
            )}
          </>
        ) : (
          <>
            <FavoriteGrid
              items={activeTab === "ink" ? inkFavorites : clashFavorites}
              source={activeTab as FavoriteSource}
              onUnfavorite={(id) => handleUnfavorite(id, activeTab as FavoriteSource)}
            />

            {(activeTab === "ink" ? inkFavorites : clashFavorites).length <
              (activeTab === "ink" ? inkTotal : clashTotal) && (
              <button
                onClick={() => loadMore(activeTab as FavoriteSource)}
                disabled={activeTab === "ink" ? loadingMoreInk : loadingMoreClash}
                className="mt-6 w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-300 transition-colors disabled:opacity-50"
              >
                {(activeTab === "ink" ? loadingMoreInk : loadingMoreClash)
                  ? "Loading..."
                  : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
