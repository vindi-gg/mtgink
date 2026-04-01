import { getDailyChallenge } from "@/lib/queries";
import { getAdminClient } from "@/lib/supabase/admin";
import DailyGauntletClient from "./DailyGauntletClient";
import type { GauntletEntry } from "@/lib/types";

export const metadata = {
  title: "Daily Gauntlet",
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

  // Fetch theme details for sidebar link
  let themeLink: { label: string; href: string } | undefined;
  if (challenge.theme_id) {
    const admin = getAdminClient();
    const { data: theme } = await admin
      .from("gauntlet_themes")
      .select("theme_type, oracle_id, tribe, set_code, artist, label")
      .eq("id", challenge.theme_id)
      .single();
    if (theme) {
      if (theme.theme_type === "set" && theme.set_code) {
        themeLink = { label: theme.set_code.toUpperCase(), href: `/db/expansions/${theme.set_code}` };
      } else if (theme.theme_type === "tribe" && theme.tribe) {
        themeLink = { label: theme.tribe, href: `/db/tribes/${theme.tribe.toLowerCase()}` };
      } else if (theme.theme_type === "artist" && theme.artist) {
        themeLink = { label: theme.artist, href: `/artists/${theme.artist.toLowerCase().replace(/\s+/g, "-")}` };
      } else if (theme.theme_type === "card_remix" && theme.oracle_id) {
        const { data: card } = await admin
          .from("oracle_cards")
          .select("name, slug")
          .eq("oracle_id", theme.oracle_id)
          .single();
        if (card) {
          themeLink = { label: card.name, href: `/card/${card.slug}` };
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <DailyGauntletClient
        challenge={challenge}
        pool={pool}
        mode={gauntletMode as "remix" | "vs"}
        themeLink={themeLink}
      />
    </main>
  );
}
