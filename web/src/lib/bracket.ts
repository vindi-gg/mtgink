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
