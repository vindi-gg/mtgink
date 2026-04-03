import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { VoteHistoryEntry, FavoriteEntry } from "./types";

/** Get vote history for a user */
export async function getUserVoteHistory(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ votes: VoteHistoryEntry[]; total: number }> {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase not configured");

  // Get total count
  const { count } = await supabase
    .from("votes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  // Get paginated votes with card info
  const { data: rawVotes } = await supabase
    .from("votes")
    .select("id, oracle_id, winner_illustration_id, loser_illustration_id, voted_at")
    .eq("user_id", userId)
    .order("voted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (!rawVotes || rawVotes.length === 0) return { votes: [], total: count ?? 0 };

  // Batch lookup card names and printings
  const oracleIds = [...new Set(rawVotes.map((v) => v.oracle_id))];
  const illustrationIds = [
    ...new Set(rawVotes.flatMap((v) => [v.winner_illustration_id, v.loser_illustration_id])),
  ];

  const [{ data: cards }, { data: printingRows }] = await Promise.all([
    getAdminClient()
      .from("oracle_cards")
      .select("oracle_id, name, slug, type_line")
      .in("oracle_id", oracleIds),
    getAdminClient()
      .from("printings")
      .select("illustration_id, set_code, collector_number, image_version")
      .in("illustration_id", illustrationIds),
  ]);

  const cardMap = new Map((cards ?? []).map((c) => [c.oracle_id, c]));
  const printingMap = new Map((printingRows ?? []).map((p) => [p.illustration_id, p]));

  const votes: VoteHistoryEntry[] = rawVotes.map((v) => {
    const card = cardMap.get(v.oracle_id);
    const winner = printingMap.get(v.winner_illustration_id);
    const loser = printingMap.get(v.loser_illustration_id);

    return {
      vote_id: v.id,
      card_name: card?.name ?? "Unknown",
      card_slug: card?.slug ?? "unknown",
      oracle_id: v.oracle_id,
      winner_illustration_id: v.winner_illustration_id,
      loser_illustration_id: v.loser_illustration_id,
      winner_set_code: winner?.set_code ?? "",
      winner_collector_number: winner?.collector_number ?? "",
      winner_image_version: winner?.image_version ?? null,
      loser_set_code: loser?.set_code ?? "",
      loser_collector_number: loser?.collector_number ?? "",
      loser_image_version: loser?.image_version ?? null,
      voted_at: v.voted_at,
    };
  });

  return { votes, total: count ?? 0 };
}

/** Add an illustration to a user's favorites */
export async function addFavorite(
  userId: string,
  illustrationId: string,
  oracleId: string,
  source: "ink" | "clash" = "ink"
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase
    .from("favorites")
    .upsert({ user_id: userId, illustration_id: illustrationId, oracle_id: oracleId, source });
}

/** Remove an illustration from a user's favorites */
export async function removeFavorite(
  userId: string,
  illustrationId: string
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("illustration_id", illustrationId);
}

/** Batch check which illustration IDs are favorited by a user */
export async function getFavoritedIllustrations(
  userId: string,
  illustrationIds: string[]
): Promise<Set<string>> {
  if (illustrationIds.length === 0) return new Set();
  const supabase = await createClient();
  if (!supabase) return new Set();

  const { data } = await supabase
    .from("favorites")
    .select("illustration_id")
    .eq("user_id", userId)
    .in("illustration_id", illustrationIds);

  return new Set((data ?? []).map((r) => r.illustration_id));
}

/** Get a user's favorited illustrations with card info, paginated */
export async function getUserFavorites(
  userId: string,
  limit = 50,
  offset = 0,
  source?: "ink" | "clash"
): Promise<{ favorites: FavoriteEntry[]; total: number }> {
  const supabase = await createClient();
  if (!supabase) return { favorites: [], total: 0 };

  let countQuery = supabase
    .from("favorites")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (source) countQuery = countQuery.eq("source", source);
  const { count } = await countQuery;

  let query = supabase
    .from("favorites")
    .select("illustration_id, oracle_id, source, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (source) query = query.eq("source", source);

  const { data: rawFavorites } = await query.range(offset, offset + limit - 1);

  if (!rawFavorites || rawFavorites.length === 0) return { favorites: [], total: count ?? 0 };

  // Batch lookups
  const oracleIds = [...new Set(rawFavorites.map((f) => f.oracle_id))];
  const illustrationIds = rawFavorites.map((f) => f.illustration_id);

  const [{ data: cards }, { data: printingRows }] = await Promise.all([
    getAdminClient()
      .from("oracle_cards")
      .select("oracle_id, name, slug, type_line")
      .in("oracle_id", oracleIds),
    getAdminClient()
      .from("printings")
      .select("illustration_id, oracle_id, artist, set_code, collector_number, image_version")
      .in("illustration_id", illustrationIds),
  ]);

  const cardMap = new Map((cards ?? []).map((c) => [c.oracle_id, c]));
  const printingMap = new Map((printingRows ?? []).map((p) => [p.illustration_id, p]));

  const favorites: FavoriteEntry[] = rawFavorites.map((f) => {
    const card = cardMap.get(f.oracle_id);
    const printing = printingMap.get(f.illustration_id);

    return {
      illustration_id: f.illustration_id,
      oracle_id: f.oracle_id,
      card_name: card?.name ?? "Unknown",
      card_slug: card?.slug ?? "unknown",
      artist: printing?.artist ?? "Unknown",
      set_code: printing?.set_code ?? "",
      collector_number: printing?.collector_number ?? "",
      image_version: printing?.image_version ?? null,
      source: (f.source ?? "ink") as "ink" | "clash",
      created_at: f.created_at,
    };
  });

  return { favorites, total: count ?? 0 };
}
