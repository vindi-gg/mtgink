import { getDailyChallengeByDate, getDailyChallengeStats, getDailyGauntletResults } from "@/lib/queries";
import { artCropUrl } from "@/lib/image-utils";
import Link from "next/link";
import type { GauntletEntry, DailyChallengeStats } from "@/lib/types";
import DailyGauntletResultsClient from "./DailyGauntletResultsClient";

export const metadata = {
  title: "Daily Gauntlet Results — MTG Ink",
  description: "Community results for today's daily gauntlet challenge.",
};

export const dynamic = "force-dynamic";

export default async function DailyGauntletResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ?? new Date().toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];
  const isToday = date === today;

  const challenge = await getDailyChallengeByDate("gauntlet", date);

  if (!challenge || !challenge.pool) {
    return (
      <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-300 mb-2">No Results</h1>
          <p className="text-gray-500 mb-4">
            {isToday
              ? "No daily gauntlet challenge available today."
              : `No daily gauntlet found for ${date}.`}
          </p>
          <Link href="/daily/gauntlet" className="text-amber-400 hover:underline text-sm">
            Play today&apos;s gauntlet
          </Link>
        </div>
      </main>
    );
  }

  const [stats, gauntletResults] = await Promise.all([
    getDailyChallengeStats(challenge.id),
    getDailyGauntletResults(challenge.id),
  ]);
  const pool = (challenge.pool as GauntletEntry[]).slice(0, 20);

  // Build ranked list from champion_counts
  const championCounts: Record<string, number> = stats?.champion_counts ?? {};
  const participationCount = stats?.participation_count ?? 0;

  // Sort pool by champion count (descending), then alphabetically
  const ranked = pool
    .map((entry) => {
      const id = challenge.gauntlet_mode === "remix" ? entry.illustration_id : entry.oracle_id;
      return {
        ...entry,
        champId: id,
        count: championCounts[id] ?? 0,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Split into champions (picked at least once) and neglected (never picked)
  const champions = ranked.filter((r) => r.count > 0);
  const neglected = ranked.filter((r) => r.count === 0);

  // Top win streaks: best individual card streaks across all plays
  const allStreaks: { name: string; wins: number; entry?: typeof ranked[0] }[] = [];
  for (const result of gauntletResults) {
    const results = result.results as { oracle_id: string; illustration_id: string; name: string; wins: number }[];
    if (!Array.isArray(results)) continue;
    for (const r of results) {
      if (r.wins === 0) continue;
      const id = challenge.gauntlet_mode === "remix" ? r.illustration_id : r.oracle_id;
      const poolEntry = ranked.find((e) => e.champId === id);
      allStreaks.push({ name: r.name, wins: r.wins, entry: poolEntry });
    }
  }
  const topStreaks = allStreaks
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 10);

  // Biggest losers: aggregate total wins across all results entries
  // Cards with fewest total wins (that aren't champions) are biggest losers
  const winTotals: Record<string, { name: string; totalWins: number; appearances: number; entry?: typeof ranked[0] }> = {};
  for (const result of gauntletResults) {
    const results = result.results as { oracle_id: string; illustration_id: string; name: string; wins: number }[];
    if (!Array.isArray(results)) continue;
    for (const r of results) {
      const id = challenge.gauntlet_mode === "remix" ? r.illustration_id : r.oracle_id;
      if (!winTotals[id]) {
        const poolEntry = ranked.find((e) => e.champId === id);
        winTotals[id] = { name: r.name, totalWins: 0, appearances: 0, entry: poolEntry };
      }
      winTotals[id].totalWins += r.wins;
      winTotals[id].appearances += 1;
    }
  }
  const biggestLosers = Object.entries(winTotals)
    .map(([id, data]) => ({
      id,
      ...data,
      avgWins: data.appearances > 0 ? data.totalWins / data.appearances : 0,
    }))
    .sort((a, b) => a.avgWins - b.avgWins)
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-4 md:py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            {!isToday && (
              <Link
                href="/daily/gauntlet/results"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                &larr; Today
              </Link>
            )}
          </div>
          <h1 className="text-2xl font-bold text-amber-400">{challenge.title}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {isToday ? "Today's gauntlet" : date} &middot;{" "}
            {participationCount.toLocaleString()} player{participationCount !== 1 ? "s" : ""}
          </p>
          {stats && stats.avg_champion_wins != null && (
            <p className="text-xs text-gray-500 mt-1">
              Avg champion wins: {stats.avg_champion_wins.toFixed(1)} &middot; Best streak: {stats.max_champion_wins}
            </p>
          )}
        </div>

        {/* Play CTA if today and not yet played */}
        {isToday && (
          <DailyGauntletResultsClient challengeId={challenge.id} />
        )}

        {participationCount === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No one has completed this gauntlet yet.</p>
            {isToday && (
              <Link href="/daily/gauntlet" className="text-amber-400 hover:underline text-sm mt-2 inline-block">
                Be the first to play
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Top Champions */}
            <div className="mb-8">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                Top Champions
              </h2>
              <div className="space-y-2">
                {champions.map((entry, i) => {
                  const pct = participationCount > 0
                    ? Math.round((entry.count / participationCount) * 100)
                    : 0;
                  return (
                    <div key={entry.champId} className="flex items-center gap-3 p-2 rounded-lg bg-gray-900">
                      <span className="text-sm text-gray-600 w-6 text-right font-mono">
                        {i + 1}.
                      </span>
                      <img
                        src={artCropUrl(entry.set_code, entry.collector_number, entry.image_version)}
                        alt={entry.name}
                        className={`w-12 h-9 object-cover rounded ${i === 0 ? "ring-2 ring-amber-500/60" : ""}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/card/${entry.slug}`}
                            className="text-sm font-medium text-gray-200 hover:text-amber-400 truncate transition-colors"
                          >
                            {entry.name}
                          </Link>
                          <span className="text-xs text-gray-500 ml-2 shrink-0">
                            {entry.count}x ({pct}%)
                          </span>
                        </div>
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-amber-500/80 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Win Streaks */}
            {topStreaks.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Top Win Streaks
                </h2>
                <div className="space-y-1.5">
                  {topStreaks.map((streak, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-900">
                        <span className="text-sm text-gray-600 w-6 text-right font-mono">
                          {i + 1}.
                        </span>
                        {streak.entry && (
                          <img
                            src={artCropUrl(streak.entry.set_code, streak.entry.collector_number, streak.entry.image_version)}
                            alt={streak.name}
                            className="w-10 h-7 object-cover rounded"
                          />
                        )}
                        <span className="text-sm text-gray-300 truncate flex-1">
                          {streak.name}
                        </span>
                        <span className="text-sm font-bold text-amber-400 shrink-0">
                          {streak.wins} win{streak.wins !== 1 ? "s" : ""}
                        </span>
                      </div>
                  ))}
                </div>
              </div>
            )}

            {/* Biggest Losers */}
            {biggestLosers.length > 0 && gauntletResults.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Biggest Losers
                </h2>
                <div className="space-y-1.5">
                  {biggestLosers.map((loser, i) => (
                    <div key={loser.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-900">
                      <span className="text-sm text-gray-600 w-6 text-right font-mono">
                        {i + 1}.
                      </span>
                      {loser.entry && (
                        <img
                          src={artCropUrl(loser.entry.set_code, loser.entry.collector_number, loser.entry.image_version)}
                          alt={loser.name}
                          className="w-10 h-7 object-cover rounded opacity-50"
                        />
                      )}
                      <span className="text-sm text-gray-400 truncate flex-1">
                        {loser.name}
                      </span>
                      <span className="text-xs text-gray-600 shrink-0">
                        avg {loser.avgWins.toFixed(1)} wins
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Never Chosen */}
            {neglected.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Never Chosen
                </h2>
                <div className="flex flex-wrap gap-2">
                  {neglected.map((entry) => (
                    <Link
                      key={entry.champId}
                      href={`/card/${entry.slug}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors group"
                    >
                      <img
                        src={artCropUrl(entry.set_code, entry.collector_number, entry.image_version)}
                        alt={entry.name}
                        className="w-8 h-6 object-cover rounded opacity-50 group-hover:opacity-80 transition-opacity"
                      />
                      <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                        {entry.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Share + Nav */}
        <ShareButton challenge={challenge} stats={stats} date={date} />

        <div className="text-center mt-6">
          <Link href="/daily/gauntlet" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            {isToday ? "Play today's gauntlet" : "Back to today's gauntlet"}
          </Link>
        </div>
      </div>
    </main>
  );
}

function ShareButton({ challenge, stats, date }: { challenge: { title: string }, stats: DailyChallengeStats | null, date: string }) {
  const text = `${challenge.title}\n${stats?.participation_count ?? 0} players\nmtg.ink/daily/gauntlet/results?date=${date}`;
  return (
    <DailyGauntletShareButton text={text} />
  );
}

// Need a client component for clipboard
import DailyGauntletShareButton from "./DailyGauntletShareButton";
