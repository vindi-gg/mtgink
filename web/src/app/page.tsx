import Link from "next/link";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";
import { websiteJsonLd, JsonLd } from "@/lib/jsonld";
import DailyChallengesSection from "@/components/DailyChallengesSection";
import ModeCards from "@/components/ModeCards";
import { DB_MODES, PlayModeIcon } from "@/lib/play-modes";
import type { DailyChallenge, DailyChallengeStats } from "@/lib/types";

export const revalidate = 60;

export const metadata = {
  title: "MTG Ink — Compare & Rank Every MTG Card Art",
  description: "Compare and rank every Magic: The Gathering card art. Browse 37,000+ cards, discover illustrations across all printings, and vote for the best MTG art.",
};

export default async function HomePage() {
  let challenges: (DailyChallenge & { stats: DailyChallengeStats })[] = [];
  let modeImages: string[] = [];

  try {
    const admin = getAdminClient();
    const today = new Date().toISOString().split("T")[0];

    // One parallel round trip — challenges (with stats joined) + random art
    const [{ data: challengeRows }, { data: recentPrintings }] = await Promise.all([
      admin.from("daily_challenges")
        .select("*, daily_challenge_stats(*)")
        .eq("challenge_date", today),
      admin.from("printings")
        .select("set_code, collector_number")
        .not("illustration_id", "is", null)
        .order("released_at", { ascending: false })
        .limit(50),
    ]);

    // Generate challenges only on first request of the day (rare)
    let dailyChallenges = challengeRows;
    if (!dailyChallenges || dailyChallenges.length === 0) {
      await admin.rpc("generate_daily_challenges", { p_date: today });
      const { data: fresh } = await admin.from("daily_challenges")
        .select("*, daily_challenge_stats(*)")
        .eq("challenge_date", today);
      dailyChallenges = fresh;
    }

    if (dailyChallenges && dailyChallenges.length > 0) {
      const defaultStats: DailyChallengeStats = {
        participation_count: 0,
        illustration_votes: null,
        side_a_votes: 0,
        side_b_votes: 0,
        champion_counts: null,
        avg_champion_wins: null,
        max_champion_wins: 0,
      };

      challenges = (dailyChallenges as (DailyChallenge & { daily_challenge_stats: DailyChallengeStats | null })[])
        .map((c) => ({
          ...c,
          stats: c.daily_challenge_stats ?? defaultStats,
        }));
    }

    // Mode card images — pick 3 random from recent printings (no extra query)
    if (recentPrintings && recentPrintings.length > 0) {
      const shuffled = recentPrintings.sort(() => Math.random() - 0.5).slice(0, 3);
      modeImages = shuffled.map((p: { set_code: string; collector_number: string }) =>
        artCropUrl(p.set_code, p.collector_number),
      );
    }
  } catch {
    // DB not available at build time — render without data
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <JsonLd data={websiteJsonLd()} />
      <div className="flex-1 px-4 pt-8 md:pt-16">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="font-bold mb-4 flex flex-col items-center" style={{ lineHeight: 0.9, fontFamily: "'Futura', 'Futura Bold', 'Trebuchet MS', Arial, sans-serif" }}>
            <span className="text-3xl tracking-[0.25em] text-white">MTG</span>
            <span className="text-6xl text-amber-400 tracking-wide">INK</span>
          </h1>
          <p className="text-gray-400 text-lg mb-10">
            Compare and rank every MTG card art. Discover the best illustrations.
          </p>

          {/* Daily Challenges — always rendered so client-side fetch catches day rollover */}
          <DailyChallengesSection challenges={challenges} />

          {/* Modes */}
          <ModeCards images={modeImages} />

          {/* DB Links */}
          <div className="grid gap-3 sm:grid-cols-2 text-left mt-2 mb-4">
            {DB_MODES.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
              >
                <PlayModeIcon d={s.icon} className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="text-sm font-bold text-gray-200">{s.label}</span>
                  <p className="text-xs text-gray-500">{s.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
