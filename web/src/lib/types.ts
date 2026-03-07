export interface OracleCard {
  oracle_id: string;
  name: string;
  slug: string;
  layout: string | null;
  type_line: string | null;
}

export interface Printing {
  scryfall_id: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  released_at: string | null;
  rarity: string | null;
  tcgplayer_id: number | null;
}

export interface Illustration {
  illustration_id: string;
  oracle_id: string;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  released_at: string | null;
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

export interface VoteResponse {
  winner_rating: ArtRating;
  loser_rating: ArtRating;
  next: ComparisonPair;
}

export interface VoteHistoryEntry {
  vote_id: number;
  card_name: string;
  card_slug: string;
  oracle_id: string;
  winner_illustration_id: string;
  loser_illustration_id: string;
  winner_set_code: string;
  winner_collector_number: string;
  loser_set_code: string;
  loser_collector_number: string;
  voted_at: string;
}

export interface MtgSet {
  set_code: string;
  name: string;
  set_type: string | null;
  released_at: string | null;
  card_count: number | null;
  printed_size: number | null;
  icon_svg_uri: string | null;
  parent_set_code: string | null;
  block_code: string | null;
  block: string | null;
  digital: number;
}

export interface SetCard {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  slug: string;
  collector_number: string;
  rarity: string | null;
  type_line: string | null;
  mana_cost: string | null;
}

export interface OracleCardFull extends OracleCard {
  mana_cost: string | null;
  colors: string | null;
  cmc: number | null;
}

export interface BracketCard {
  oracle_id: string;
  name: string;
  slug: string;
  type_line: string | null;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  illustration_id: string;
}

export interface BracketMatchup {
  index: number;
  seedA: number;
  seedB: number;
  winner: number | null;
}

export interface BracketState {
  cards: BracketCard[];
  rounds: BracketMatchup[][];
  currentRound: number;
  currentMatchup: number;
  completed: boolean;
  createdAt: string;
}

export interface DecklistEntry {
  quantity: number;
  name: string;
  section: string;
}

export interface DeckCardWithArt {
  card: OracleCard;
  quantity: number;
  section: string;
  illustrations: (Illustration & { rating: ArtRating | null })[];
}

export interface DeckImportResponse {
  cards: DeckCardWithArt[];
  unmatched: DecklistEntry[];
  stats: { total: number; matched: number; unmatched: number };
}

export interface Deck {
  id: string;
  user_id: string;
  name: string;
  format: string | null;
  source_url: string | null;
  is_public: number;
  created_at: string;
  updated_at: string;
}

export interface DeckSummary extends Deck {
  card_count: number;
  unique_cards: number;
}

export interface DeckCard {
  deck_id: string;
  oracle_id: string;
  quantity: number;
  section: string;
  selected_illustration_id: string | null;
  to_buy: number;
}

export interface DeckCardDetail extends DeckCard {
  card: OracleCard;
  illustrations: (Illustration & { rating: ArtRating | null })[];
}

export interface DeckDetail extends Deck {
  cards: DeckCardDetail[];
  unmatched: string[];
}

export interface PurchaseListItem {
  deck_id: string;
  deck_name: string;
  oracle_id: string;
  card_name: string;
  card_slug: string;
  illustration_id: string | null;
  artist: string;
  set_code: string;
  collector_number: string;
  tcgplayer_id: number | null;
}

export interface MoxfieldDeck {
  id: string;
  name: string;
  format: string;
  mainboard: Record<string, MoxfieldCard>;
  sideboard: Record<string, MoxfieldCard>;
  commanders: Record<string, MoxfieldCard>;
  companions: Record<string, MoxfieldCard>;
}

export interface MoxfieldCard {
  quantity: number;
  card: { name: string; oracle_id?: string };
}

export interface FavoriteEntry {
  illustration_id: string;
  oracle_id: string;
  card_name: string;
  card_slug: string;
  artist: string;
  set_code: string;
  collector_number: string;
  created_at: string;
}
