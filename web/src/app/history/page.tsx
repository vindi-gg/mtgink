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
  const then = new Date(dateStr).getTime();
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

interface GauntletHistoryEntry {
  id: number;
  mode: string;
  pool_size: number;
  champion_oracle_id: string;
  champion_illustration_id: string;
  champion_name: string;
  champion_wins: number;
  results: {
    oracle_id: string;
    illustration_id: string;
    name: string;
    artist: string;
    set_code: string;
    collector_number: string;
    wins: number;
    position: number;
  }[];
  card_name: string | null;
  filter_label: string | null;
  daily_challenge_id: number | null;
  completed_at: string;
}

type Tab = "votes" | "gauntlets";

const PAGE_SIZE = 50;
const GAUNTLET_PAGE_SIZE = 20;

export default function HistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("votes");
  const [votes, setVotes] = useState<VoteHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Gauntlet state
  const [gauntlets, setGauntlets] = useState<GauntletHistoryEntry[]>([]);
  const [gauntletTotal, setGauntletTotal] = useState(0);
  const [gauntletLoading, setGauntletLoading] = useState(false);
  const [gauntletLoadingMore, setGauntletLoadingMore] = useState(false);
  const [gauntletLoaded, setGauntletLoaded] = useState(false);

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

  const fetchGauntlets = useCallback(
    async (offset: number) => {
      const res = await fetch(
        `/api/gauntlet/history?limit=${GAUNTLET_PAGE_SIZE}&offset=${offset}`
      );
      if (!res.ok) return null;
      return res.json() as Promise<{
        gauntlets: GauntletHistoryEntry[];
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

  // Load gauntlets when tab switches
  useEffect(() => {
    if (tab !== "gauntlets" || !authChecked || gauntletLoaded) return;

    setGauntletLoading(true);
    fetchGauntlets(0).then((data) => {
      if (data) {
        setGauntlets(data.gauntlets);
        setGauntletTotal(data.total);
      }
      setGauntletLoading(false);
      setGauntletLoaded(true);
    });
  }, [tab, authChecked, gauntletLoaded, fetchGauntlets]);

  async function loadMore() {
    setLoadingMore(true);
    const data = await fetchVotes(votes.length);
    if (data) {
      setVotes((prev) => [...prev, ...data.votes]);
      setTotal(data.total);
    }
    setLoadingMore(false);
  }

  async function loadMoreGauntlets() {
    setGauntletLoadingMore(true);
    const data = await fetchGauntlets(gauntlets.length);
    if (data) {
      setGauntlets((prev) => [...prev, ...data.gauntlets]);
      setGauntletTotal(data.total);
    }
    setGauntletLoadingMore(false);
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
        <h1 className="text-3xl font-bold mb-4">History</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          <button
            onClick={() => setTab("votes")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "votes"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Votes {total > 0 && <span className="text-gray-600 ml-1">({total})</span>}
          </button>
          <button
            onClick={() => setTab("gauntlets")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "gauntlets"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Gauntlets {gauntletTotal > 0 && <span className="text-gray-600 ml-1">({gauntletTotal})</span>}
          </button>
        </div>

        {/* Votes Tab */}
        {tab === "votes" && (
          <>
            {loading ? (
              <div className="text-gray-400">Loading votes...</div>
            ) : votes.length === 0 ? (
              <div className="text-gray-500">
                No votes yet.{" "}
                <Link href="/showdown/remix" className="text-amber-400 hover:underline">
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
                              vote.winner_collector_number,
                              vote.winner_image_version
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
                              vote.loser_collector_number,
                              vote.loser_image_version
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
          </>
        )}

        {/* Gauntlets Tab */}
        {tab === "gauntlets" && (
          <>
            {gauntletLoading ? (
              <div className="text-gray-400">Loading gauntlets...</div>
            ) : gauntlets.length === 0 ? (
              <div className="text-gray-500">
                No gauntlets played yet.{" "}
                <Link href="/showdown/gauntlet" className="text-amber-400 hover:underline">
                  Play a gauntlet
                </Link>{" "}
                to see your results here.
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {gauntlets.map((g) => {
                    const champion = g.results.find((r) => r.position === g.results.length);
                    const champSetCode = champion?.set_code ?? "";
                    const champCollectorNum = champion?.collector_number ?? "";

                    return (
                      <div
                        key={g.id}
                        className="p-4 rounded-lg bg-gray-900 border border-gray-800"
                      >
                        <div className="flex items-start gap-4">
                          {/* Champion thumbnail */}
                          <img
                            src={artCropUrl(champSetCode, champCollectorNum, null)}
                            alt={g.champion_name}
                            className="w-20 h-14 object-cover rounded ring-2 ring-amber-500/50 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-bold text-amber-400 truncate">
                                {g.champion_name}
                              </span>
                              <span className="text-xs text-gray-500 shrink-0">
                                {g.champion_wins} win{g.champion_wins !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400">
                              {g.card_name
                                ? `${g.daily_challenge_id ? "Daily: " : ""}${g.card_name} Remix`
                                : g.filter_label
                                  ? `${g.daily_challenge_id ? "Daily: " : ""}${g.filter_label} Gauntlet`
                                  : g.daily_challenge_id
                                    ? "Daily Gauntlet"
                                    : "Random Gauntlet"}
                              <span className="text-gray-600"> · {g.pool_size} cards</span>
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5">
                              {timeAgo(g.completed_at)}
                            </div>
                          </div>
                        </div>

                        {/* Runner-ups */}
                        <div className="flex gap-1.5 mt-3 overflow-x-auto">
                          {[...g.results]
                            .sort((a, b) => b.position - a.position)
                            .slice(1, 6) // Skip champion (already shown), show next 5
                            .map((r) => (
                              <img
                                key={`${r.illustration_id}-${r.position}`}
                                src={artCropUrl(r.set_code, r.collector_number, null)}
                                alt={r.name}
                                className="w-10 h-10 object-cover rounded opacity-60"
                                title={`#${g.results.length - r.position + 1} ${r.name} (${r.wins} wins)`}
                              />
                            ))}
                          {g.results.length > 6 && (
                            <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-xs text-gray-500 shrink-0">
                              +{g.results.length - 6}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {gauntlets.length < gauntletTotal && (
                  <button
                    onClick={loadMoreGauntlets}
                    disabled={gauntletLoadingMore}
                    className="mt-6 w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-300 transition-colors disabled:opacity-50"
                  >
                    {gauntletLoadingMore ? "Loading..." : "Load more"}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
