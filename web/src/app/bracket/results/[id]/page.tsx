"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useImageMode } from "@/lib/image-mode";
import type { BracketState, BracketCard } from "@/lib/types";
import { getChampion, getBracketProgress } from "@/lib/bracket-logic";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

interface CompletionData {
  completion: {
    id: string;
    seed_id: string;
    champion_name: string;
    champion_illustration_id: string;
    bracket_state: BracketState;
    completed_at: string;
  };
  seed: {
    id: string;
    label: string;
    bracket_size: number;
    play_count: number;
  } | null;
}

export default function BracketResultsPage() {
  const params = useParams<{ id: string }>();
  const { cardUrl, imageMode } = useImageMode();
  const [data, setData] = useState<CompletionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/bracket/results/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then(setData)
      .catch((err) => setError(err.message));
  }, [params.id]);

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading results...</p>
      </main>
    );
  }

  const { completion, seed } = data;
  const state = completion.bracket_state;
  const champion = getChampion(state);
  const progress = getBracketProgress(state);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          {seed && (
            <p className="text-xs text-amber-400 uppercase tracking-widest mb-1">
              {seed.label}
            </p>
          )}
          <h1 className="text-2xl font-bold text-white">Bracket Results</h1>
          <p className="text-sm text-gray-500 mt-1">
            {state.cards.length} cards · {formatDate(completion.completed_at)}
            {seed && ` · ${seed.play_count} play${seed.play_count !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Champion */}
        {champion && (
          <div className="text-center mb-8">
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400 mb-4">Champion</p>
            <img
              src={cardUrl(champion.set_code, champion.collector_number, champion.image_version)}
              alt={champion.name}
              className="w-full max-w-sm rounded-xl border-4 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.3)] mx-auto"
            />
            <h2 className="text-2xl font-bold text-white mt-4">{champion.name}</h2>
            <p className="text-sm text-gray-400 mt-1">{champion.artist} · {champion.set_code.toUpperCase()}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          <button
            onClick={handleCopy}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/40 transition-colors cursor-pointer"
          >
            {copied ? "Copied!" : "Share Results"}
          </button>
          {seed && (
            <Link
              href={`/bracket?seed=${seed.id}`}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 transition-colors"
            >
              Play this bracket
            </Link>
          )}
          {champion && (
            <Link
              href={`/card/${champion.slug}`}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 transition-colors"
            >
              View {champion.name}
            </Link>
          )}
        </div>

        {/* Bracket rounds — read-only */}
        <div className="space-y-6">
          {progress.roundNames.map((roundName, roundIdx) => {
            const round = state.rounds[roundIdx];
            if (!round) return null;
            return (
              <div key={roundIdx}>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  {roundName}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {round.map((matchup) => {
                    const cardA = matchup.seedA >= 0 ? state.cards[matchup.seedA] : null;
                    const cardB = matchup.seedB >= 0 ? state.cards[matchup.seedB] : null;
                    const winnerId = matchup.winner;

                    return (
                      <div key={matchup.index} className="bg-gray-900/50 border border-gray-800 rounded-lg p-2">
                        <div className="grid grid-cols-2 gap-1.5">
                          {[{ card: cardA, seed: matchup.seedA }, { card: cardB, seed: matchup.seedB }].map(({ card, seed: s }) => {
                            if (!card) return <div key={s} className="aspect-[626/457] bg-gray-800/30 rounded-md" />;
                            const isWinner = winnerId === s;
                            const isLoser = winnerId !== null && winnerId !== s;
                            return (
                              <div key={s} className={`relative ${isLoser ? "opacity-30" : ""}`}>
                                <img
                                  src={cardUrl(card.set_code, card.collector_number, card.image_version)}
                                  alt={card.name}
                                  className={`w-full rounded-md ${isWinner ? "ring-2 ring-amber-500" : ""}`}
                                  style={{ aspectRatio: imageMode === "card" ? "488/680" : "626/457" }}
                                />
                                {isWinner && (
                                  <div className="absolute top-1 right-1">
                                    <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                                      <svg className="w-2.5 h-2.5 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  </div>
                                )}
                                {imageMode !== "card" && (
                                  <p className="text-[8px] text-gray-400 truncate mt-0.5 px-0.5">{card.name}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
