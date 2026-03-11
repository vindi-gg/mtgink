"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FavoriteButton from "@/components/FavoriteButton";
import type { FavoriteEntry, FavoriteSource } from "@/lib/types";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";

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
  const [loading, setLoading] = useState(true);
  const [loadingMoreInk, setLoadingMoreInk] = useState(false);
  const [loadingMoreClash, setLoadingMoreClash] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<FavoriteSource>("ink");

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

  useEffect(() => {
    if (!authChecked) return;

    Promise.all([fetchFavorites(0, "ink"), fetchFavorites(0, "clash")]).then(
      ([inkData, clashData]) => {
        if (inkData) {
          setInkFavorites(inkData.favorites);
          setInkTotal(inkData.total);
        }
        if (clashData) {
          setClashFavorites(clashData.favorites);
          setClashTotal(clashData.total);
        }
        setLoading(false);
      }
    );
  }, [authChecked, fetchFavorites]);

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

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-gray-400">Loading...</div>
        </div>
      </main>
    );
  }

  const totalAll = inkTotal + clashTotal;
  const currentItems = activeTab === "ink" ? inkFavorites : clashFavorites;
  const currentTotal = activeTab === "ink" ? inkTotal : clashTotal;
  const isLoadingMore = activeTab === "ink" ? loadingMoreInk : loadingMoreClash;

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
        <div className="flex gap-1 mb-6">
          <button
            onClick={() => setActiveTab("ink")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "ink"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Illustrations{inkTotal > 0 ? ` (${inkTotal})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("clash")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "clash"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Cards{clashTotal > 0 ? ` (${clashTotal})` : ""}
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading favorites...</div>
        ) : (
          <>
            <FavoriteGrid
              items={currentItems}
              source={activeTab}
              onUnfavorite={(id) => handleUnfavorite(id, activeTab)}
            />

            {currentItems.length < currentTotal && (
              <button
                onClick={() => loadMore(activeTab)}
                disabled={isLoadingMore}
                className="mt-6 w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-300 transition-colors disabled:opacity-50"
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
