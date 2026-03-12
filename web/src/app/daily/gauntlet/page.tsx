import { getDailyChallenge } from "@/lib/queries";
import DailyGauntletClient from "./DailyGauntletClient";
import type { GauntletEntry } from "@/lib/types";

export const metadata = {
  title: "Daily Gauntlet — MTG Ink",
  description: "Today's daily gauntlet. King of the hill — winner stays!",
};

export const dynamic = "force-dynamic";

export default async function DailyGauntletPage() {
  const challenge = await getDailyChallenge("gauntlet");

  if (!challenge || !challenge.pool) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">No daily gauntlet challenge available today.</p>
      </main>
    );
  }

  // Pool comes pre-ordered from the stored proc — keep it deterministic for all users
  const rawPool = challenge.pool as GauntletEntry[];
  const pool = rawPool.slice(0, 20);
  const gauntletMode = challenge.gauntlet_mode ?? "vs";

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <DailyGauntletClient
        challenge={challenge}
        pool={pool}
        mode={gauntletMode as "remix" | "vs"}
      />
    </main>
  );
}
