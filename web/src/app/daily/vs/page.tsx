import { getDailyChallenge, getCardByOracleId } from "@/lib/queries";
import { getAdminClient } from "@/lib/supabase/admin";
import DailyVsClient from "./DailyVsClient";

export const metadata = {
  title: "Daily VS",
  description: "Today's daily card matchup. Pick your winner!",
};

export const dynamic = "force-dynamic";

export default async function DailyVsPage() {
  const challenge = await getDailyChallenge("vs");

  if (!challenge || !challenge.oracle_id_a || !challenge.oracle_id_b ||
      !challenge.illustration_id_a || !challenge.illustration_id_b) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">No daily VS challenge available today.</p>
      </main>
    );
  }

  const [cardA, cardB, printingsData] = await Promise.all([
    getCardByOracleId(challenge.oracle_id_a),
    getCardByOracleId(challenge.oracle_id_b),
    getAdminClient()
      .from("printings")
      .select("illustration_id, set_code, collector_number, image_version, artist, sets!inner(name, digital)")
      .in("illustration_id", [challenge.illustration_id_a, challenge.illustration_id_b])
      .eq("sets.digital", false)
      .order("released_at", { ascending: false }),
  ]);

  // Pick best printing per illustration
  const printingMap = new Map<string, { set_code: string; collector_number: string; image_version: string | null; artist: string }>();
  for (const p of printingsData.data ?? []) {
    if (!printingMap.has(p.illustration_id)) {
      printingMap.set(p.illustration_id, {
        set_code: p.set_code,
        collector_number: p.collector_number,
        image_version: p.image_version,
        artist: p.artist,
      });
    }
  }

  const printingA = printingMap.get(challenge.illustration_id_a);
  const printingB = printingMap.get(challenge.illustration_id_b);

  if (!cardA || !cardB || !printingA || !printingB) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Failed to load daily VS challenge data.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 pt-20 pb-8">
      <DailyVsClient
        challenge={challenge}
        cardA={cardA}
        cardB={cardB}
        printingA={printingA}
        printingB={printingB}
      />
    </main>
  );
}
