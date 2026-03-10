import { getAdminClient } from "@/lib/supabase/admin";

const PROTECTION_DISABLED = process.env.DISABLE_VOTE_PROTECTION === "true";

/** K factor tiers based on session vote count in last 24h */
const K_TIERS = [
  { maxVotes: 50, k: 16 },   // First 50: full weight
  { maxVotes: 200, k: 8 },   // 51-200: half weight
  { maxVotes: 500, k: 4 },   // 201-500: quarter weight
  { maxVotes: Infinity, k: 2 }, // 500+: minimal weight
];

const K_TIERS_AUTH = [
  { maxVotes: 100, k: 32 },
  { maxVotes: 400, k: 16 },
  { maxVotes: 1000, k: 8 },
  { maxVotes: Infinity, k: 4 },
];

interface VoteCheck {
  allowed: boolean;
  reason?: string;
  kFactor: number;
}

/** Check if an art vote (illustration-level) should be allowed, and compute K factor */
export async function checkArtVote(
  sessionId: string,
  winnerId: string,
  loserId: string,
  isAuthenticated: boolean,
): Promise<VoteCheck> {
  if (PROTECTION_DISABLED) {
    return { allowed: true, kFactor: isAuthenticated ? 32 : 16 };
  }

  const admin = getAdminClient();

  // Check duplicate: same session, same pair (either direction), last hour
  const { count: dupeCount } = await admin
    .from("votes")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .or(
      `and(winner_illustration_id.eq.${winnerId},loser_illustration_id.eq.${loserId}),` +
      `and(winner_illustration_id.eq.${loserId},loser_illustration_id.eq.${winnerId})`
    )
    .gte("voted_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((dupeCount ?? 0) > 0) {
    return { allowed: false, reason: "Already voted on this matchup recently", kFactor: 0 };
  }

  // Get session vote count in last 24h for diminishing K
  const { count: dayCount } = await admin
    .from("votes")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .gte("voted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const tiers = isAuthenticated ? K_TIERS_AUTH : K_TIERS;
  const tier = tiers.find((t) => (dayCount ?? 0) < t.maxVotes) ?? tiers[tiers.length - 1];

  return { allowed: true, kFactor: tier.k };
}

/** Check if a card vote (oracle-level) should be allowed, and compute K factor */
export async function checkCardVote(
  sessionId: string,
  winnerOracleId: string,
  loserOracleId: string,
  isAuthenticated: boolean,
): Promise<VoteCheck> {
  if (PROTECTION_DISABLED) {
    return { allowed: true, kFactor: isAuthenticated ? 32 : 16 };
  }

  const admin = getAdminClient();

  // Check duplicate: same session, same pair (either direction), last hour
  const { count: dupeCount } = await admin
    .from("card_votes")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .or(
      `and(winner_oracle_id.eq.${winnerOracleId},loser_oracle_id.eq.${loserOracleId}),` +
      `and(winner_oracle_id.eq.${loserOracleId},loser_oracle_id.eq.${winnerOracleId})`
    )
    .gte("voted_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((dupeCount ?? 0) > 0) {
    return { allowed: false, reason: "Already voted on this matchup recently", kFactor: 0 };
  }

  // Get session vote count in last 24h for diminishing K
  const { count: dayCount } = await admin
    .from("card_votes")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .gte("voted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const tiers = isAuthenticated ? K_TIERS_AUTH : K_TIERS;
  const tier = tiers.find((t) => (dayCount ?? 0) < t.maxVotes) ?? tiers[tiers.length - 1];

  return { allowed: true, kFactor: tier.k };
}
