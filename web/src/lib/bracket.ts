import { getAdminClient } from "@/lib/supabase/admin";
import type { BracketCard } from "./types";

/** Get random bracket cards — one representative printing per unique card */
export async function getRandomBracketCards(count = 32): Promise<BracketCard[]> {
  const { data, error } = await getAdminClient().rpc("get_random_bracket_cards", {
    p_count: count,
  });

  if (error) throw new Error(`Failed to get bracket cards: ${error.message}`);
  return data as BracketCard[];
}

export interface SetBracketFilters {
  rarities?: string[];
  printing?: "all" | "new" | "reprints";
}

/** Get bracket cards for a set with optional rarity/printing filters.
 * Returns one BracketCard per unique oracle_id in stable collector-number order
 * so a seeded shuffle on the client produces a deterministic pool. */
export async function getBracketCardsForSet(
  setCode: string,
  filters: SetBracketFilters = {},
): Promise<BracketCard[]> {
  let query = getAdminClient()
    .from("printings")
    .select(
      "oracle_id, illustration_id, artist, set_code, collector_number, image_version, rarity, is_reprint, sets!inner(name, digital), oracle_cards!inner(name, slug, type_line)",
    )
    .eq("set_code", setCode)
    .not("illustration_id", "is", null)
    .eq("sets.digital", false);

  if (filters.rarities && filters.rarities.length > 0) {
    query = query.in("rarity", filters.rarities);
  }
  if (filters.printing === "new") {
    query = query.eq("is_reprint", false);
  } else if (filters.printing === "reprints") {
    query = query.eq("is_reprint", true);
  }

  const { data, error } = await query.order("collector_number", { ascending: true });
  if (error) throw new Error(`Failed to load bracket cards for set: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Deduplicate: one BracketCard per unique oracle_id (first collector number wins)
  const seen = new Set<string>();
  const out: BracketCard[] = [];
  for (const p of data) {
    if (seen.has(p.oracle_id)) continue;
    seen.add(p.oracle_id);
    const card = p.oracle_cards as unknown as { name: string; slug: string; type_line: string | null };
    const set = p.sets as unknown as { name: string };
    out.push({
      oracle_id: p.oracle_id,
      name: card.name,
      slug: card.slug,
      type_line: card.type_line,
      artist: p.artist,
      set_code: p.set_code,
      set_name: set.name,
      collector_number: p.collector_number,
      illustration_id: p.illustration_id,
      image_version: p.image_version,
    });
  }
  return out;
}
