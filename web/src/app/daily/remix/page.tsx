import { getDailyChallenge, getCardByOracleId } from "@/lib/queries";
import { getAdminClient } from "@/lib/supabase/admin";
import DailyRemixClient from "./DailyRemixClient";

export const metadata = {
  title: "Daily Remix — MTG Ink",
  description: "Today's daily art showdown. Pick your favorite art!",
};

export const dynamic = "force-dynamic";

export default async function DailyRemixPage() {
  const challenge = await getDailyChallenge("remix");

  if (!challenge || !challenge.oracle_id || !challenge.illustration_id_a || !challenge.illustration_id_b) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">No daily remix challenge available today.</p>
      </main>
    );
  }

  const [card, printingsData] = await Promise.all([
    getCardByOracleId(challenge.oracle_id),
    getAdminClient()
      .from("printings")
      .select("illustration_id, set_code, collector_number, image_version, artist, sets!inner(name, digital)")
      .in("illustration_id", [challenge.illustration_id_a, challenge.illustration_id_b])
      .eq("sets.digital", false)
      .order("released_at", { ascending: false }),
  ]);

  if (!card) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Failed to load daily remix challenge.</p>
      </main>
    );
  }

  // Pick best printing per illustration (newest non-digital)
  const printingMap = new Map<string, { illustration_id: string; set_code: string; collector_number: string; image_version: string | null; artist: string }>();
  for (const p of printingsData.data ?? []) {
    if (!printingMap.has(p.illustration_id)) {
      printingMap.set(p.illustration_id, {
        illustration_id: p.illustration_id,
        set_code: p.set_code,
        collector_number: p.collector_number,
        image_version: p.image_version,
        artist: p.artist,
      });
    }
  }

  const illA = printingMap.get(challenge.illustration_id_a);
  const illB = printingMap.get(challenge.illustration_id_b);

  if (!illA || !illB) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Failed to load illustration data.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 pt-20 pb-8">
      <DailyRemixClient
        challenge={challenge}
        cardName={card.name}
        cardSlug={card.slug}
        oracleId={challenge.oracle_id}
        illustrationA={illA}
        illustrationB={illB}
      />
    </main>
  );
}
