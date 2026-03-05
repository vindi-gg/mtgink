"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FavoriteButton from "@/components/FavoriteButton";
import { useFavorites } from "@/hooks/useFavorites";
import type { VoteHistoryEntry } from "@/lib/types";
import { artCropUrl } from "@/lib/image-utils";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const PAGE_SIZE = 50;

export default function HistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [votes, setVotes] = useState<VoteHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const allIllustrationIds = useMemo(
    () =>
      votes.flatMap((v) =>
        [v.winner_illustration_id, v.loser_illustration_id].filter(Boolean)
      ),
    [votes]
  );
  const { favorites, toggle: toggleFavorite } = useFavorites(allIllustrationIds);

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

  const fetchVotes = useCallback(
    async (offset: number) => {
      const res = await fetch(
        `/api/votes/history?limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (!res.ok) return null;
      return res.json() as Promise<{
        votes: VoteHistoryEntry[];
        total: number;
      }>;
    },
    []
  );

  useEffect(() => {
    if (!authChecked) return;

    fetchVotes(0).then((data) => {
      if (data) {
        setVotes(data.votes);
        setTotal(data.total);
      }
      setLoading(false);
    });
  }, [authChecked, fetchVotes]);

  async function loadMore() {
    setLoadingMore(true);
    const data = await fetchVotes(votes.length);
    if (data) {
      setVotes((prev) => [...prev, ...data.votes]);
      setTotal(data.total);
    }
    setLoadingMore(false);
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-gray-400">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Vote History</h1>
        <p className="text-gray-400 mb-6">
          {total > 0 ? `${total} votes recorded` : "Your votes will appear here."}
        </p>

        {loading ? (
          <div className="text-gray-400">Loading votes...</div>
        ) : votes.length === 0 ? (
          <div className="text-gray-500">
            No votes yet.{" "}
            <Link href="/compare" className="text-amber-400 hover:underline">
              Start comparing
            </Link>{" "}
            to build your history.
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {votes.map((vote) => (
                <Link
                  key={vote.vote_id}
                  href={`/card/${vote.card_slug}`}
                  className="flex items-center gap-4 p-3 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <img
                        src={artCropUrl(
                          vote.winner_set_code,
                          vote.winner_collector_number
                        )}
                        alt="Winner"
                        className="w-16 h-12 object-cover rounded ring-2 ring-amber-400"
                      />
                      {vote.winner_illustration_id && (
                        <div className="absolute -top-1 -right-1">
                          <FavoriteButton
                            illustrationId={vote.winner_illustration_id}
                            oracleId={vote.oracle_id}
                            isFavorited={favorites.has(vote.winner_illustration_id)}
                            onToggle={toggleFavorite}
                            size="sm"
                          />
                        </div>
                      )}
                    </div>
                    <span className="text-gray-500 text-xs">vs</span>
                    <div className="relative">
                      <img
                        src={artCropUrl(
                          vote.loser_set_code,
                          vote.loser_collector_number
                        )}
                        alt="Loser"
                        className="w-16 h-12 object-cover rounded opacity-60"
                      />
                      {vote.loser_illustration_id && (
                        <div className="absolute -top-1 -right-1">
                          <FavoriteButton
                            illustrationId={vote.loser_illustration_id}
                            oracleId={vote.oracle_id}
                            isFavorited={favorites.has(vote.loser_illustration_id)}
                            onToggle={toggleFavorite}
                            size="sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {vote.card_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {timeAgo(vote.voted_at)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {votes.length < total && (
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
