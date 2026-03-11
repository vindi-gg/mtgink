"use client";

import { useState } from "react";
import { artCropUrl } from "@/lib/image-utils";
import type { DailyChallengeStats, DailyChallenge, GauntletEntry } from "@/lib/types";

interface DailyResultsPanelProps {
  challenge: DailyChallenge;
  stats: DailyChallengeStats;
  onClose?: () => void;
  /** For remix: map illustration_id → { artist, set_code, collector_number, image_version } */
  illustrationMeta?: Map<string, { artist: string; set_code: string; collector_number: string; image_version: string | null }>;
  /** For VS: card names */
  cardNameA?: string;
  cardNameB?: string;
  /** For gauntlet: your champion */
  yourChampionId?: string;
  yourChampionWins?: number;
}

export default function DailyResultsPanel({
  challenge,
  stats,
  onClose,
  illustrationMeta,
  cardNameA,
  cardNameB,
  yourChampionId,
  yourChampionWins,
}: DailyResultsPanelProps) {
  const [copied, setCopied] = useState(false);

  const total = stats.participation_count;

  function shareResults() {
    let text = `MTG Ink Daily ${challenge.challenge_type.charAt(0).toUpperCase() + challenge.challenge_type.slice(1)} — ${challenge.title}\n`;

    if (challenge.challenge_type === "vs") {
      const aVotes = stats.side_a_votes;
      const bVotes = stats.side_b_votes;
      const totalVotes = aVotes + bVotes;
      if (totalVotes > 0) {
        const aPct = Math.round((aVotes / totalVotes) * 100);
        const bPct = 100 - aPct;
        text += `${cardNameA ?? "A"} ${aPct}% vs ${bPct}% ${cardNameB ?? "B"}\n`;
      }
    } else if (challenge.challenge_type === "gauntlet" && yourChampionId) {
      const pool = challenge.pool ?? [];
      const champ = pool.find((e: GauntletEntry) => e.illustration_id === yourChampionId || e.oracle_id === yourChampionId);
      if (champ) {
        text += `My champion: ${champ.name} (${yourChampionWins} wins)\n`;
      }
    }

    text += `${total} players today\nmtg.ink/daily/${challenge.challenge_type}`;

    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-xl p-5 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
          Community Results
        </h3>
        <span className="text-xs text-gray-500">{total.toLocaleString()} player{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Remix: bar chart of illustration votes */}
      {challenge.challenge_type === "remix" && stats.illustration_votes && (
        <div className="space-y-2 mb-4">
          {Object.entries(stats.illustration_votes)
            .sort(([, a], [, b]) => b - a)
            .map(([illId, votes]) => {
              const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
              const meta = illustrationMeta?.get(illId);
              return (
                <div key={illId} className="flex items-center gap-2">
                  {meta && (
                    <img
                      src={artCropUrl(meta.set_code, meta.collector_number, meta.image_version)}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-300 truncate">{meta?.artist ?? illId.slice(0, 8)}</span>
                      <span className="text-gray-400 ml-2">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* VS: big percentage split */}
      {challenge.challenge_type === "vs" && (
        <div className="mb-4">
          {(() => {
            const aVotes = stats.side_a_votes;
            const bVotes = stats.side_b_votes;
            const totalVotes = aVotes + bVotes;
            const aPct = totalVotes > 0 ? Math.round((aVotes / totalVotes) * 100) : 50;
            const bPct = totalVotes > 0 ? 100 - aPct : 50;
            return (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-200">{cardNameA ?? "A"}</span>
                  <span className="text-sm font-bold text-gray-200">{cardNameB ?? "B"}</span>
                </div>
                <div className="flex h-8 rounded-lg overflow-hidden">
                  <div
                    className="bg-amber-500 flex items-center justify-center text-sm font-bold text-gray-900 transition-all duration-500"
                    style={{ width: `${aPct}%` }}
                  >
                    {aPct}%
                  </div>
                  <div
                    className="bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-200 transition-all duration-500"
                    style={{ width: `${bPct}%` }}
                  >
                    {bPct}%
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Gauntlet: top 3 champions */}
      {challenge.challenge_type === "gauntlet" && stats.champion_counts && (
        <div className="space-y-2 mb-4">
          <div className="text-xs text-gray-500 mb-1">Top Champions</div>
          {Object.entries(stats.champion_counts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([champId, count], i) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const pool = challenge.pool ?? [];
              const entry = pool.find(
                (e: GauntletEntry) => e.illustration_id === champId || e.oracle_id === champId,
              );
              const isYours = champId === yourChampionId;
              return (
                <div key={champId} className={`flex items-center gap-2 ${isYours ? "ring-1 ring-amber-500/50 rounded-lg p-1 -m-1" : ""}`}>
                  <span className="text-xs text-gray-600 w-4 text-right font-mono">{i + 1}.</span>
                  {entry && (
                    <img
                      src={artCropUrl(entry.set_code, entry.collector_number, entry.image_version)}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-300 truncate">
                        {entry?.name ?? champId.slice(0, 8)}
                        {isYours && <span className="text-amber-400 ml-1">(you)</span>}
                      </span>
                      <span className="text-gray-400 ml-2">{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          {stats.avg_champion_wins != null && (
            <div className="text-xs text-gray-500 mt-2">
              Avg champion wins: {stats.avg_champion_wins.toFixed(1)} &middot; Best streak: {stats.max_champion_wins}
              {yourChampionWins != null && (
                <span className="text-amber-400"> &middot; Your streak: {yourChampionWins}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={shareResults}
          className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
        >
          {copied ? "Copied!" : "Share Results"}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
