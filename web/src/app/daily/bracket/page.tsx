import { getDailyChallenge } from "@/lib/queries";
import DailyBracketClient from "./DailyBracketClient";
import type { GauntletEntry, BracketCard } from "@/lib/types";

export const metadata = {
  title: "Daily Bracket",
  description: "Today's daily bracket — 16-card single-elimination art tournament!",
};

export const dynamic = "force-dynamic";

/** Convert a GauntletEntry (brew/daily pool entry) into a BracketCard */
function entryToBracketCard(entry: GauntletEntry): BracketCard {
  return {
    oracle_id: entry.oracle_id,
    name: entry.name,
    slug: entry.slug,
    type_line: entry.type_line ?? "",
    artist: entry.artist,
    set_code: entry.set_code,
    set_name: entry.set_name,
    collector_number: entry.collector_number,
    illustration_id: entry.illustration_id,
    image_version: entry.image_version,
  };
}

export default async function DailyBracketPage() {
  const challenge = await getDailyChallenge("bracket");

  if (!challenge || !challenge.pool) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">No daily bracket challenge available today.</p>
      </main>
    );
  }

  // Pool comes pre-ordered from the stored proc — keep it deterministic.
  // Slice to bracket_size (default 16) so all users get the same tree.
  const rawPool = challenge.pool as GauntletEntry[];
  const bracketSize = challenge.bracket_size ?? 16;
  const cards = rawPool.slice(0, bracketSize).map(entryToBracketCard);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <DailyBracketClient
        challenge={challenge}
        cards={cards}
      />
    </main>
  );
}
