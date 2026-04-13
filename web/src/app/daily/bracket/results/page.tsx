import { getDailyChallenge, getDailyChallengeByDate, getDailyChallengeStats } from "@/lib/queries";
import { artCropUrl } from "@/lib/image-utils";
import Link from "next/link";
import type { GauntletEntry } from "@/lib/types";

export const metadata = {
  title: "Daily Bracket Results",
  description: "See how the community voted in today's Daily Bracket",
};

export const dynamic = "force-dynamic";

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function DailyBracketResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const isToday = !date;
  const challenge = date
    ? await getDailyChallengeByDate("bracket", date)
    : await getDailyChallenge("bracket");

  if (!challenge) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">No daily bracket challenge found.</p>
      </main>
    );
  }

  const stats = await getDailyChallengeStats(challenge.id);
  const pool = (challenge.pool ?? []) as GauntletEntry[];
  const bracketSize = challenge.bracket_size ?? 16;
  const cards = pool.slice(0, bracketSize);

  // Build top champions from champion_counts
  const championCounts = stats?.champion_counts ?? {};
  const totalParticipants = stats?.participation_count ?? 0;
  const topChampions = Object.entries(championCounts)
    .map(([illId, count]) => {
      const card = cards.find((c) => c.illustration_id === illId);
      return { illId, count: count as number, card };
    })
    .filter((e) => e.card)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs text-amber-400 uppercase tracking-widest mb-1">
            {isToday ? "Today's" : date} Daily Bracket
          </p>
          <h1 className="text-2xl font-bold text-white">{challenge.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalParticipants.toLocaleString()} player{totalParticipants !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Yesterday's results link */}
        {isToday && (
          <div className="text-center mb-6">
            <Link
              href={`/daily/bracket/results?date=${yesterday()}`}
              className="text-sm text-amber-400 hover:text-amber-300 underline"
            >
              See yesterday&apos;s Daily Bracket winner
            </Link>
          </div>
        )}

        {/* Top Champions */}
        {topChampions.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Top Champions</h2>
            <div className="grid gap-3">
              {topChampions.map(({ card, count }, i) => {
                if (!card) return null;
                const pct = totalParticipants > 0
                  ? Math.round((count / totalParticipants) * 100)
                  : 0;
                return (
                  <div
                    key={card.illustration_id}
                    className="flex items-center gap-4 p-3 rounded-xl bg-gray-900/50 border border-gray-800"
                  >
                    <span className={`text-2xl font-bold ${i === 0 ? "text-amber-400" : "text-gray-600"} w-8 text-center`}>
                      {i + 1}
                    </span>
                    <img
                      src={artCropUrl(card.set_code, card.collector_number, card.image_version)}
                      alt={card.name}
                      className={`w-20 h-[58px] object-cover rounded-md ${i === 0 ? "ring-2 ring-amber-500" : "border border-gray-800"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate ${i === 0 ? "text-amber-400" : "text-white"}`}>
                        {card.name}
                      </p>
                      <p className="text-xs text-gray-500">{card.artist}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-white">{pct}%</p>
                      <p className="text-[10px] text-gray-500">{count} vote{count !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 border border-gray-800 rounded-xl bg-gray-900/40">
            <p className="text-gray-400 mb-4">No results yet — be the first to play!</p>
            <Link
              href="/daily/bracket"
              className="inline-block px-4 py-2 rounded-lg bg-amber-500 text-gray-900 font-semibold hover:bg-amber-400 transition-colors"
            >
              Play today&apos;s bracket
            </Link>
          </div>
        )}

        {/* Play CTA if viewing today and not yet played */}
        {isToday && totalParticipants > 0 && (
          <div className="text-center mt-8">
            <Link
              href="/daily/bracket"
              className="inline-block px-6 py-2.5 rounded-lg bg-amber-500 text-gray-900 font-bold hover:bg-amber-400 transition-colors"
            >
              Play today&apos;s bracket
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
