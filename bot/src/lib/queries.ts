import { getClient } from "../supabase.js";
import type { OracleCard, Illustration, ArtRating, ComparisonPair, VotePayload } from "./types.js";

interface IllustrationWithRating {
  illustration_id: string;
  oracle_id: string;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  released_at: string;
  elo_rating: number | null;
  vote_count: number | null;
  win_count: number | null;
  loss_count: number | null;
  image_version: string | null;
}

function toIllustration(row: IllustrationWithRating): Illustration {
  return {
    illustration_id: row.illustration_id,
    oracle_id: row.oracle_id,
    artist: row.artist,
    set_code: row.set_code,
    set_name: row.set_name,
    collector_number: row.collector_number,
    released_at: row.released_at,
    image_version: row.image_version ?? null,
  };
}

function toRating(row: IllustrationWithRating): ArtRating | null {
  if (row.elo_rating == null) return null;
  return {
    illustration_id: row.illustration_id,
    oracle_id: row.oracle_id,
    elo_rating: row.elo_rating,
    vote_count: row.vote_count ?? 0,
    win_count: row.win_count ?? 0,
    loss_count: row.loss_count ?? 0,
    updated_at: new Date().toISOString(),
  };
}

/** Search cards by name (2+ illustrations), for autocomplete */
export async function searchCards(query: string, limit = 25): Promise<OracleCard[]> {
  const { data, error } = await getClient().rpc("search_cards_with_art", {
    p_query: query,
    p_limit: limit,
  });

  if (error) throw new Error(`Search failed: ${error.message}`);

  return (data ?? []).map((row: { oracle_id: string; name: string; slug: string; layout: string | null; type_line: string | null; mana_cost: string | null; colors: unknown; cmc: number | null }) => ({
    ...row,
    colors: row.colors ? JSON.stringify(row.colors) : null,
  }));
}

/** Get a random oracle_card with 2+ illustrations */
export async function getRandomCard(): Promise<OracleCard> {
  const { data, error } = await getClient().rpc("get_random_cards", {
    p_count: 1,
    p_min_illustrations: 2,
  });

  if (error) throw new Error(`Failed to get random card: ${error.message}`);
  if (!data || data.length === 0) throw new Error("No cards found");

  const r = data[0] as { oracle_id: string; name: string; slug: string; layout: string | null; type_line: string | null; mana_cost: string | null; colors: unknown; cmc: number | null };
  return {
    oracle_id: r.oracle_id,
    name: r.name,
    slug: r.slug,
    layout: r.layout,
    type_line: r.type_line,
    mana_cost: r.mana_cost,
    colors: r.colors ? JSON.stringify(r.colors) : null,
    cmc: r.cmc,
  };
}

/** Get a comparison pair for a card */
export async function getComparisonPair(oracleId: string): Promise<ComparisonPair> {
  // Fetch card info
  const { data: cardData } = await getClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
    .eq("oracle_id", oracleId)
    .single();

  if (!cardData) throw new Error("Card not found");

  const card: OracleCard = {
    ...cardData,
    colors: cardData.colors ? JSON.stringify(cardData.colors) : null,
  };

  const { data, error } = await getClient().rpc("get_comparison_pair", {
    p_oracle_id: oracleId,
  });

  if (error) throw new Error(`Failed to get comparison pair: ${error.message}`);
  if (!data || data.length < 2) throw new Error("Card has fewer than 2 illustrations");

  return {
    card,
    a: toIllustration(data[0]),
    b: toIllustration(data[1]),
    a_rating: toRating(data[0]),
    b_rating: toRating(data[1]),
  };
}

/** Record a vote and return updated ratings */
export async function recordVote(payload: VotePayload, kFactor = 32): Promise<{
  winnerRating: ArtRating;
  loserRating: ArtRating;
}> {
  const { data, error } = await getClient().rpc("record_vote", {
    p_oracle_id: payload.oracle_id,
    p_winner_illustration_id: payload.winner_illustration_id,
    p_loser_illustration_id: payload.loser_illustration_id,
    p_session_id: payload.session_id,
    p_user_id: payload.user_id ?? null,
    p_vote_source: payload.vote_source ?? null,
    p_k_factor: kFactor,
  });

  if (error) throw new Error(`Failed to record vote: ${error.message}`);

  const row = (data as Record<string, unknown>[])[0];
  return {
    winnerRating: {
      illustration_id: row.winner_illustration_id as string,
      oracle_id: payload.oracle_id,
      elo_rating: row.winner_elo as number,
      vote_count: row.winner_vote_count as number,
      win_count: row.winner_win_count as number,
      loss_count: row.winner_loss_count as number,
      updated_at: new Date().toISOString(),
    },
    loserRating: {
      illustration_id: row.loser_illustration_id as string,
      oracle_id: payload.oracle_id,
      elo_rating: row.loser_elo as number,
      vote_count: row.loser_vote_count as number,
      win_count: row.loser_win_count as number,
      loss_count: row.loser_loss_count as number,
      updated_at: new Date().toISOString(),
    },
  };
}
