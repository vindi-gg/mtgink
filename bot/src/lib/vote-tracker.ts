import type { Illustration, OracleCard } from "./types.js";
import crypto from "node:crypto";

interface ActiveMatchup {
  a: Illustration;
  b: Illustration;
  card: OracleCard;
  voters: Set<string>;
  voteCounts: { a: number; b: number };
  expiresAt: number;
}

const matchups = new Map<string, ActiveMatchup>();

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

// Periodic cleanup of expired matchups
setInterval(() => {
  const now = Date.now();
  for (const [id, matchup] of matchups) {
    if (now >= matchup.expiresAt) {
      matchups.delete(id);
    }
  }
}, CLEANUP_INTERVAL).unref();

export function createMatchup(card: OracleCard, a: Illustration, b: Illustration): string {
  const id = crypto.randomBytes(4).toString("hex"); // 8-char hex
  matchups.set(id, {
    a,
    b,
    card,
    voters: new Set(),
    voteCounts: { a: 0, b: 0 },
    expiresAt: Date.now() + TTL_MS,
  });
  return id;
}

export function getMatchup(id: string): ActiveMatchup | undefined {
  const matchup = matchups.get(id);
  if (!matchup) return undefined;
  if (Date.now() >= matchup.expiresAt) {
    matchups.delete(id);
    return undefined;
  }
  return matchup;
}

export function hasVoted(id: string, userId: string): boolean {
  return matchups.get(id)?.voters.has(userId) ?? false;
}

export function recordLocalVote(id: string, userId: string, side: "a" | "b"): void {
  const matchup = matchups.get(id);
  if (!matchup) return;
  matchup.voters.add(userId);
  matchup.voteCounts[side]++;
}
