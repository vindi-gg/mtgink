import { NextRequest, NextResponse } from "next/server";
import { getRandomBracketCards } from "@/lib/bracket";
import { getAdminClient } from "@/lib/supabase/admin";
import { resolveBrewPool } from "@/lib/brew-queries";
import type { GauntletEntry, BracketCard } from "@/lib/types";

export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const count = parseInt(req.nextUrl.searchParams.get("count") ?? "16", 10);
  const themed = req.nextUrl.searchParams.get("themed") !== "false";

  // Try to pick a random theme for a named bracket
  if (themed) {
    try {
      const admin = getAdminClient();
      // Fetch all eligible themes, then pick one at random client-side.
      // PostgREST doesn't support ORDER BY random().
      const { data: themes } = await admin
        .from("gauntlet_themes")
        .select("id, label, theme_type, oracle_id, tribe, tag_id, set_code, artist")
        .eq("is_active", true)
        .neq("theme_type", "card_remix")
        .gte("pool_size_estimate", count);

      const theme = themes && themes.length > 0
        ? themes[Math.floor(Math.random() * themes.length)]
        : null;

      if (theme) {
        const pool = await resolveBrewPool({
          mode: "bracket",
          source: theme.theme_type === "tribe" ? "tribe"
            : theme.theme_type === "tag" ? "tag"
            : theme.theme_type === "artist" ? "artist"
            : theme.theme_type === "set" ? "expansion"
            : "all",
          sourceId: theme.tribe ?? theme.tag_id ?? theme.set_code ?? theme.artist ?? theme.oracle_id ?? "_all",
          poolSize: count,
        });

        if (pool.length >= count) {
          const cards = pool.slice(0, count).map(entryToBracketCard);
          // Strip "Gauntlet"/"Remix" suffix from theme label
          const name = theme.label.replace(/\s+(Gauntlet|Remix)$/i, "").trim() + " Bracket";
          return NextResponse.json({ cards, name });
        }
      }
    } catch {
      // Fall through to random
    }
  }

  // Fallback: fully random cards
  const cards = await getRandomBracketCards(count);
  return NextResponse.json({ cards, name: null });
}
