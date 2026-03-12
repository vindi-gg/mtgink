import Link from "next/link";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";
import DailyChallengesSection from "@/components/DailyChallengesSection";
import ModeCards from "@/components/ModeCards";
import type { DailyChallenge, DailyChallengeStats } from "@/lib/types";

export const revalidate = 60;

export const metadata = {
  title: "MTG Ink — Discover & Rank Magic Cards and Art",
  description: "Discover and rank the best Magic: The Gathering cards and art.",
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
        .filter((c) => c.challenge_type !== "vs")
        .map((c) => ({
          ...c,
          stats: c.daily_challenge_stats ?? defaultStats,
        }))
        .sort((a, b) => {
          const order: Record<string, number> = { remix: 0, gauntlet: 1 };
          return (order[a.challenge_type] ?? 9) - (order[b.challenge_type] ?? 9);
        });
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
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-2xl">
          <h1 className="text-5xl font-bold mb-4 flex flex-col items-center" style={{ lineHeight: 1.1 }}>
            <span className="tracking-widest">MTG</span>
            <span className="text-amber-400" style={{ letterSpacing: "0.32em" }}>INK</span>
          </h1>
          <p className="text-gray-400 text-lg mb-10">
            Discover and rank the best Magic: The Gathering cards and art.
          </p>

          {/* Daily Challenges — server-rendered, participation checked client-side */}
          {challenges.length > 0 && (
            <DailyChallengesSection challenges={challenges} />
          )}

          {/* Modes */}
          <ModeCards images={modeImages} />

          <div className="flex gap-4 justify-center">
            <Link
              href="/browse"
              className="px-5 py-2 border border-gray-700 text-gray-300 font-medium rounded-lg hover:border-gray-500 hover:text-white transition-colors"
            >
              Browse Cards
            </Link>
            <Link
              href="/deck"
              className="px-5 py-2 border border-gray-700 text-gray-300 font-medium rounded-lg hover:border-gray-500 hover:text-white transition-colors"
            >
              Deck Explorer
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-800 bg-gray-900/50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="text-[15px] font-bold tracking-[0.08em]">
                <span className="text-gray-400">MTG </span><span className="text-amber-400">INK</span>
              </div>
              <p className="max-w-md text-xs leading-relaxed text-gray-500">
                MTG Ink is an independent fan project and is not affiliated with, endorsed by, or sponsored by Wizards of the Coast, Hasbro, or any of their subsidiaries. Card images and data courtesy of Scryfall.
              </p>
            </div>
            <nav className="flex gap-6 text-xs text-gray-500">
              <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
              <a href="mailto:dan@mtg.ink" className="hover:text-gray-300 transition-colors">Contact</a>
            </nav>
          </div>
          <p className="mt-6 text-[11px] text-gray-600/60">
            &copy; {new Date().getFullYear()} MTG Ink. Card data and images courtesy of Scryfall and Wizards of the Coast.
          </p>
        </div>
      </footer>
    </main>
  );
}
