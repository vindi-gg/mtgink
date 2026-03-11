import { getDailyChallenge, getCardByOracleId, getIllustrationsForCard, getComparisonPair } from "@/lib/queries";
import DailyRemixClient from "./DailyRemixClient";
import type { Illustration } from "@/lib/types";

export const metadata = {
  title: "Daily Remix — MTG Ink",
  description: "Today's daily art showdown. See every version, pick the best!",
};

export const dynamic = "force-dynamic";

export default async function DailyRemixPage() {
  const challenge = await getDailyChallenge("remix");

  if (!challenge || !challenge.oracle_id) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">No daily remix challenge available today.</p>
      </main>
    );
  }

  const [card, illustrations, initialPair] = await Promise.all([
    getCardByOracleId(challenge.oracle_id),
    getIllustrationsForCard(challenge.oracle_id),
    getComparisonPair(challenge.oracle_id),
  ]);

  if (!card || illustrations.length < 2) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Failed to load daily remix challenge.</p>
      </main>
    );
  }

  // Serialize illustration metadata for client
  const illustrationMeta = illustrations.map((ill: Illustration) => ({
    illustration_id: ill.illustration_id,
    artist: ill.artist,
    set_code: ill.set_code,
    collector_number: ill.collector_number,
    image_version: ill.image_version,
  }));

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 pt-20 pb-8">
      <DailyRemixClient
        challenge={challenge}
        cardName={card.name}
        cardSlug={card.slug}
        oracleId={challenge.oracle_id}
        initialPair={initialPair}
        illustrations={illustrationMeta}
        totalIllustrations={illustrations.length}
      />
    </main>
  );
}
