export interface OracleCard {
  oracle_id: string;
  name: string;
  slug: string;
  layout: string | null;
  type_line: string | null;
  mana_cost: string | null;
  colors: string | null;
  cmc: number | null;
}

export interface Illustration {
  illustration_id: string;
  oracle_id: string;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  released_at: string | null;
  image_version: string | null;
}

export interface ArtRating {
  illustration_id: string;
  oracle_id: string;
  elo_rating: number;
  vote_count: number;
  win_count: number;
  loss_count: number;
  updated_at: string;
}

export interface ComparisonPair {
  card: OracleCard;
  a: Illustration;
  b: Illustration;
  a_rating: ArtRating | null;
  b_rating: ArtRating | null;
}

export interface VotePayload {
  oracle_id: string;
  winner_illustration_id: string;
  loser_illustration_id: string;
  session_id: string;
  user_id?: string;
  vote_source?: string;
}
