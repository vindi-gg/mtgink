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

/** DFC layout types that have two card faces */
export const DFC_LAYOUTS = ["modal_dfc", "transform", "reversible_card"] as const;

export interface Printing {
  scryfall_id: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  released_at: string | null;
  rarity: string | null;
  tcgplayer_id: number | null;
  image_version: string | null;
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
  card_b?: OracleCard;
  a: Illustration;
  b: Illustration;
  a_rating: ArtRating | null;
  b_rating: ArtRating | null;
}

export interface CompareFilters {
  colors?: string[];
  type?: string;
  subtype?: string;
  set_code?: string;
  rules_text?: string;
  mode?: "same" | "cross";
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
  winner_image_version: string | null;
  loser_set_code: string;
  loser_collector_number: string;
  loser_image_version: string | null;
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
  digital: boolean;
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
  image_version: string | null;
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
  image_version: string | null;
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

export interface CardFace {
  face_index: number;
  name: string;
  mana_cost: string | null;
  type_line: string | null;
  oracle_text: string | null;
  illustration_id: string | null;
  image_uris: {
    normal?: string;
    art_crop?: string;
    large?: string;
    small?: string;
  } | null;
}

export interface DecklistEntry {
  quantity: number;
  name: string;
  section: string;
  original_set_code?: string;
  original_collector_number?: string;
  original_is_foil?: boolean;
}

export interface DeckCardWithArt {
  card: OracleCard;
  quantity: number;
  section: string;
  illustrations: (Illustration & { rating: ArtRating | null })[];
  original_set_code?: string;
  original_collector_number?: string;
  original_is_foil?: boolean;
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
  is_public: boolean;
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
  to_buy: boolean;
  original_set_code: string | null;
  original_collector_number: string | null;
}

export interface DeckCardDetail extends DeckCard {
  card: OracleCard;
  illustrations: (Illustration & { rating: ArtRating | null; cheapest_price?: number | null })[];
  illustration_count: number;
  back_face_url?: string | null;
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
  image_version: string | null;
  tcgplayer_id: number | null;
}

export interface MoxfieldBoard {
  cards: Record<string, MoxfieldCard>;
}

export interface MoxfieldDeck {
  id: string;
  name: string;
  format: string;
  boards: {
    mainboard?: MoxfieldBoard;
    sideboard?: MoxfieldBoard;
    commanders?: MoxfieldBoard;
    companions?: MoxfieldBoard;
  };
  /** Legacy flat format (v2 API) */
  mainboard?: Record<string, MoxfieldCard>;
  sideboard?: Record<string, MoxfieldCard>;
  commanders?: Record<string, MoxfieldCard>;
  companions?: Record<string, MoxfieldCard>;
}

export interface MoxfieldCard {
  quantity: number;
  isFoil?: boolean;
  card: { name: string; oracle_id?: string; set?: string; cn?: string; scryfall_id?: string };
}

export type FavoriteSource = "ink" | "clash";

export interface FavoriteEntry {
  illustration_id: string;
  oracle_id: string;
  card_name: string;
  card_slug: string;
  artist: string;
  set_code: string;
  collector_number: string;
  image_version: string | null;
  source: FavoriteSource;
  created_at: string;
}

// --- Clash (card-level voting) types ---

export interface CardRating {
  oracle_id: string;
  elo_rating: number;
  vote_count: number;
  win_count: number;
  loss_count: number;
}

export interface ClashCard {
  oracle_id: string;
  name: string;
  slug: string;
  type_line: string | null;
  mana_cost: string | null;
  colors: string | null;
  cmc: number | null;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  illustration_id: string;
  image_version: string | null;
}

export interface ClashPair {
  a: ClashCard;
  b: ClashCard;
  a_rating: CardRating | null;
  b_rating: CardRating | null;
}

export interface CardVotePayload {
  winner_oracle_id: string;
  loser_oracle_id: string;
  session_id: string;
  user_id?: string;
  vote_source?: string;
}

export interface CardVoteResponse {
  winner_rating: CardRating;
  loser_rating: CardRating;
  next: ClashPair;
}

// --- Artist types ---

export interface Artist {
  id: number;
  name: string;
  slug: string;
  illustration_count: number;
  hero_set_code: string | null;
  hero_collector_number: string | null;
  hero_image_version: string | null;
}

export interface ArtistStats {
  artist_id: number;
  period: string;
  total_votes: number;
  total_wins: number;
  avg_elo: number | null;
  top_illustration_id: string | null;
  computed_at: string;
}

export interface ArtistIllustration {
  illustration_id: string;
  oracle_id: string;
  card_name: string;
  card_slug: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  released_at: string | null;
  elo_rating: number | null;
  vote_count: number | null;
  win_count: number | null;
  loss_count: number | null;
  image_version: string | null;
}

// --- Database browse types ---

export interface Tribe {
  tribe: string;
  slug: string;
  card_count: number;
}

export interface Tag {
  tag_id: string;
  label: string;
  slug: string;
  type: string;
  description: string | null;
  usage_count: number;
  source: string;
  rule_definition: string | null;
  category: string | null;
}

export interface BrowseCard {
  oracle_id: string;
  name: string;
  slug: string;
  type_line: string | null;
  mana_cost: string | null;
  set_code: string;
  collector_number: string;
  image_version: string | null;
  cheapest_price?: number | null;
}

// --- Gauntlet types ---

export interface GauntletEntry {
  name: string;
  slug: string;
  oracle_id: string;
  illustration_id: string;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_version: string | null;
  type_line: string | null;
  mana_cost: string | null;
}

// --- Gauntlet Theme types ---

export interface GauntletTheme {
  id: number;
  theme_type: "card_remix" | "tribe" | "tag" | "set" | "artist" | "art_tag";
  pool_mode: "remix" | "vs";
  label: string;
  description: string | null;
  oracle_id: string | null;
  tribe: string | null;
  tag_id: string | null;
  set_code: string | null;
  artist: string | null;
  preview_set_code: string | null;
  preview_collector_number: string | null;
  preview_image_version: string | null;
  pool_size_estimate: number | null;
  is_active: boolean;
}

// --- Daily Challenge types ---

export interface DailyChallenge {
  id: number;
  challenge_date: string;
  challenge_type: "remix" | "vs" | "gauntlet";
  oracle_id: string | null;
  oracle_id_a: string | null;
  oracle_id_b: string | null;
  illustration_id_a: string | null;
  illustration_id_b: string | null;
  pool: GauntletEntry[] | null;
  gauntlet_mode: "remix" | "vs" | null;
  theme_id: number | null;
  title: string;
  description: string | null;
  preview_set_code: string | null;
  preview_collector_number: string | null;
  preview_image_version: string | null;
  created_at: string;
}

export interface DailyChallengeStats {
  participation_count: number;
  illustration_votes: Record<string, number> | null;
  side_a_votes: number;
  side_b_votes: number;
  champion_counts: Record<string, number> | null;
  avg_champion_wins: number | null;
  max_champion_wins: number;
}

export interface DailyChallengeWithStatus extends DailyChallenge {
  stats: DailyChallengeStats;
  participated: boolean;
}

// --- Brew types ---

export interface Brew {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  mode: "remix" | "vs" | "gauntlet";
  source: "card" | "expansion" | "tribe" | "tag" | "artist" | "all";
  source_id: string;
  source_label: string;
  colors: string[] | null;
  card_type: string | null;
  subtype: string | null;
  rules_text: string | null;
  pool_size: number | null;
  pool: GauntletEntry[] | null;
  is_public: boolean;
  play_count: number;
  slug: string;
  preview_set_code: string | null;
  preview_collector_number: string | null;
  preview_image_version: string | null;
  created_at: string;
  updated_at: string;
}

// --- Pricing types ---

export interface Marketplace {
  id: number;
  name: string;
  display_name: string;
  base_url: string;
  affiliate_param: string | null;
  currency: string;
  is_active: boolean;
}

export interface Price {
  id: number;
  scryfall_id: string;
  marketplace_id: number;
  product_id: string | null;
  product_url: string | null;
  condition: string;
  is_foil: boolean;
  market_price: number | null;
  low_price: number | null;
  mid_price: number | null;
  currency: string;
  in_stock: boolean;
  last_updated: string;
  source: string;
}

export interface PurchaseOption {
  marketplace_name: string;
  marketplace_display_name: string;
  product_url: string;
  market_price: number | null;
  low_price: number | null;
  currency: string;
}
