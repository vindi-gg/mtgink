"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FavoriteButton from "@/components/FavoriteButton";
import type { FavoriteEntry } from "@/lib/types";
import { artCropUrl } from "@/lib/image-utils";

const PAGE_SIZE = 50;

export default function FavoritesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

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
    async (offset: number) => {
      const res = await fetch(
        `/api/favorites?limit=${PAGE_SIZE}&offset=${offset}`
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

    fetchFavorites(0).then((data) => {
      if (data) {
        setFavorites(data.favorites);
        setTotal(data.total);
      }
      setLoading(false);
    });
  }, [authChecked, fetchFavorites]);

  async function loadMore() {
    setLoadingMore(true);
    const data = await fetchFavorites(favorites.length);
    if (data) {
      setFavorites((prev) => [...prev, ...data.favorites]);
      setTotal(data.total);
    }
    setLoadingMore(false);
  }

  async function handleUnfavorite(illustrationId: string) {
    const res = await fetch(`/api/favorites/${illustrationId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setFavorites((prev) =>
        prev.filter((f) => f.illustration_id !== illustrationId)
      );
      setTotal((prev) => prev - 1);
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

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Favorites</h1>
        <p className="text-gray-400 mb-6">
          {total > 0
            ? `${total} favorited illustration${total !== 1 ? "s" : ""}`
            : "Your favorited art will appear here."}
        </p>

        {loading ? (
          <div className="text-gray-400">Loading favorites...</div>
        ) : favorites.length === 0 ? (
          <div className="text-gray-500">
            No favorites yet. Tap the heart on any art to save it here.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {favorites.map((fav) => (
                <div
                  key={fav.illustration_id}
                  className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800"
                >
                  <div className="relative">
                    <Link href={`/card/${fav.card_slug}`}>
                      <img
                        src={artCropUrl(fav.set_code, fav.collector_number)}
                        alt={`${fav.card_name} by ${fav.artist}`}
                        className="w-full aspect-[4/3] object-cover"
                        loading="lazy"
                      />
                    </Link>
                    <div className="absolute top-2 right-2">
                      <FavoriteButton
                        illustrationId={fav.illustration_id}
                        oracleId={fav.oracle_id}
                        isFavorited={true}
                        onToggle={async (illustrationId) => {
                          await handleUnfavorite(illustrationId);
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

            {favorites.length < total && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-6 w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-300 transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
