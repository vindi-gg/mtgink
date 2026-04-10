import type { BracketCard, BracketMatchup, BracketState } from "./types";

/** Build human-readable names for each round based on how many cards enter it. */
function buildRoundNames(cardsPerRound: number[]): string[] {
  const names: string[] = [];
  for (const count of cardsPerRound) {
    if (count === 2) names.push("Final");
    else if (count === 3 || count === 4) names.push("Semifinals");
    else if (count >= 5 && count <= 8) names.push("Quarterfinals");
    else names.push(`Round of ${count}`);
  }
  return names;
}

/** Create initial bracket state. Supports any N >= 2; non-power-of-2 counts
 *  use byes (last card in each odd round auto-advances). */
export function createBracket(cards: BracketCard[]): BracketState {
  if (cards.length < 2) {
    throw new Error("Bracket needs at least 2 cards");
  }

  // A slot in the bracket tree is either:
  //  - a concrete card seed (for the first round or for bye-through carriers)
  //  - a reference to a previous match whose winner hasn't been decided yet
  type Slot =
    | { kind: "card"; seed: number }
    | { kind: "match"; round: number; matchIdx: number };

  const rounds: BracketMatchup[][] = [];
  let pending: Slot[] = cards.map((_, i) => ({ kind: "card", seed: i }));

  while (pending.length > 1) {
    const currentRoundIdx = rounds.length;
    const round: BracketMatchup[] = [];
    const nextPending: Slot[] = [];

    let i = 0;
    while (i + 1 < pending.length) {
      const slotA = pending[i];
      const slotB = pending[i + 1];
      const matchIdx = round.length;

      round.push({
        index: matchIdx,
        seedA: slotA.kind === "card" ? slotA.seed : -1,
        seedB: slotB.kind === "card" ? slotB.seed : -1,
        winner: null,
        next: null, // will be filled in when the next round is built
      });

      // If either slot is a reference to a previous match, wire up the
      // propagation link on that prior match so its winner lands here.
      if (slotA.kind === "match") {
        const prev = rounds[slotA.round][slotA.matchIdx];
        prev.next = { round: currentRoundIdx, match: matchIdx, slot: "A" };
      }
      if (slotB.kind === "match") {
        const prev = rounds[slotB.round][slotB.matchIdx];
        prev.next = { round: currentRoundIdx, match: matchIdx, slot: "B" };
      }

      nextPending.push({ kind: "match", round: currentRoundIdx, matchIdx });
      i += 2;
    }

    // Odd count — the last slot sits out this round (bye). The carrier
    // passes through unchanged, so a bye card can skip multiple rounds
    // if the following rounds are also odd.
    if (i < pending.length) {
      nextPending.push(pending[i]);
    }

    rounds.push(round);
    pending = nextPending;
  }

  return {
    cards,
    rounds,
    currentRound: 0,
    currentMatchup: 0,
    completed: false,
    createdAt: new Date().toISOString(),
  };
}

/** Record a vote for a specific matchup (immutable update).
 *  Uses the explicit matchup.next propagation link when available (new
 *  brackets), falls back to the legacy floor(idx/2) rule for older
 *  brackets saved in localStorage before the byes refactor. */
export function recordVote(
  state: BracketState,
  roundIndex: number,
  matchupIndex: number,
  winnerSeed: number
): BracketState {
  const matchup = state.rounds[roundIndex]?.[matchupIndex];
  if (!matchup) throw new Error("Invalid round/matchup index");
  if (matchup.seedA < 0 || matchup.seedB < 0) throw new Error("Matchup not ready");
  if (winnerSeed !== matchup.seedA && winnerSeed !== matchup.seedB) {
    throw new Error("Winner must be one of the matchup participants");
  }

  const lastRound = state.rounds.length - 1;

  // Deep clone rounds
  const newRounds = state.rounds.map((round) =>
    round.map((m) => ({ ...m }))
  );

  // Set winner
  newRounds[roundIndex][matchupIndex].winner = winnerSeed;

  // Propagate winner
  const explicitNext = matchup.next;
  if (explicitNext !== undefined) {
    // New-style bracket with explicit propagation
    if (explicitNext !== null) {
      const target = newRounds[explicitNext.round][explicitNext.match];
      if (explicitNext.slot === "A") target.seedA = winnerSeed;
      else target.seedB = winnerSeed;
    }
  } else if (roundIndex < lastRound) {
    // Legacy bracket: assume power-of-2 layout, use floor(idx/2)
    const nextRound = roundIndex + 1;
    const nextMatchupIdx = Math.floor(matchupIndex / 2);
    const isFirstOfPair = matchupIndex % 2 === 0;

    if (isFirstOfPair) {
      newRounds[nextRound][nextMatchupIdx].seedA = winnerSeed;
    } else {
      newRounds[nextRound][nextMatchupIdx].seedB = winnerSeed;
    }
  }

  // Bracket is complete when the last round's (sole) match has a winner
  const finalMatchup = newRounds[lastRound][0];
  const completed = finalMatchup.winner !== null;

  return { ...state, rounds: newRounds, completed };
}

/** Legacy: record vote and auto-advance currentRound/currentMatchup (for sequential play) */
export function recordBracketVote(
  state: BracketState,
  winnerSeed: number
): BracketState {
  const { currentRound, currentMatchup } = state;
  const lastRound = state.rounds.length - 1;

  const newState = recordVote(state, currentRound, currentMatchup, winnerSeed);

  // Advance to next matchup
  let nextRound = currentRound;
  let nextMatchup = currentMatchup + 1;

  if (nextMatchup >= newState.rounds[nextRound].length) {
    nextRound++;
    nextMatchup = 0;
    if (nextRound > lastRound) {
      nextRound = lastRound;
      nextMatchup = 0;
    }
  }

  return {
    ...newState,
    currentRound: nextRound,
    currentMatchup: nextMatchup,
  };
}

/** Get the two cards for a specific matchup, or null if seeds not yet determined */
export function getMatchupCards(
  state: BracketState,
  roundIndex: number,
  matchupIndex: number
): { cardA: BracketCard; cardB: BracketCard; seedA: number; seedB: number } | null {
  const matchup = state.rounds[roundIndex]?.[matchupIndex];
  if (!matchup || matchup.seedA < 0 || matchup.seedB < 0) return null;
  return {
    cardA: state.cards[matchup.seedA],
    cardB: state.cards[matchup.seedB],
    seedA: matchup.seedA,
    seedB: matchup.seedB,
  };
}

/** Get the two cards for the current matchup (legacy sequential) */
export function getCurrentMatchupCards(
  state: BracketState
): { cardA: BracketCard; cardB: BracketCard } | null {
  if (state.completed) return null;
  const result = getMatchupCards(state, state.currentRound, state.currentMatchup);
  if (!result) return null;
  return { cardA: result.cardA, cardB: result.cardB };
}

/** Get the champion card, or null if bracket isn't complete */
export function getChampion(state: BracketState): BracketCard | null {
  if (!state.completed) return null;
  const lastRound = state.rounds.length - 1;
  const finalMatchup = state.rounds[lastRound][0];
  if (finalMatchup.winner === null) return null;
  return state.cards[finalMatchup.winner];
}

/** Count the cards entering each round. For round 0 it's the total card
 *  count; for later rounds it's the number of winners + byes from the
 *  previous round. */
function cardsPerRound(state: BracketState): number[] {
  const counts: number[] = [state.cards.length];
  let remaining = state.cards.length;
  for (let r = 0; r < state.rounds.length - 1; r++) {
    remaining = Math.ceil(remaining / 2);
    counts.push(remaining);
  }
  return counts;
}

/** Get bracket progress info */
export function getBracketProgress(state: BracketState): {
  totalMatchups: number;
  completedMatchups: number;
  roundName: string;
  currentRoundIndex: number;
  roundNames: string[];
  roundProgress: { completed: number; total: number }[];
} {
  const roundNames = buildRoundNames(cardsPerRound(state));
  let completedMatchups = 0;
  let totalMatchups = 0;

  const roundProgress = state.rounds.map((round) => {
    const completed = round.filter((m) => m.winner !== null).length;
    completedMatchups += completed;
    totalMatchups += round.length;
    return { completed, total: round.length };
  });

  // Find the first round that isn't fully complete
  let currentRoundIndex = state.rounds.length - 1;
  for (let r = 0; r < state.rounds.length; r++) {
    if (roundProgress[r].completed < roundProgress[r].total) {
      currentRoundIndex = r;
      break;
    }
  }

  return {
    totalMatchups,
    completedMatchups,
    roundName: roundNames[currentRoundIndex] ?? `Round ${currentRoundIndex}`,
    currentRoundIndex,
    roundNames,
    roundProgress,
  };
}

/** Get human-readable round name (legacy signature — bracketSize hint only
 *  used as a fallback when we don't have the full bracket state) */
export function getRoundName(index: number, bracketSize = 32): string {
  // Approximate cards-per-round list assuming power-of-2 halving from bracketSize
  const counts: number[] = [];
  let n = bracketSize;
  while (n >= 2) {
    counts.push(n);
    n = Math.ceil(n / 2);
  }
  const names = buildRoundNames(counts);
  return names[index] ?? `Round ${index}`;
}

/** Check if a round is fully votable (all matchups have both seeds) */
export function isRoundReady(state: BracketState, roundIndex: number): boolean {
  const round = state.rounds[roundIndex];
  if (!round) return false;
  return round.every((m) => m.seedA >= 0 && m.seedB >= 0);
}

/** Check if a round is fully completed */
export function isRoundComplete(state: BracketState, roundIndex: number): boolean {
  const round = state.rounds[roundIndex];
  if (!round) return false;
  return round.every((m) => m.winner !== null);
}

/** Save bracket to localStorage (keyed by optional slug) */
export function saveBracket(state: BracketState, slug?: string): void {
  if (typeof window === "undefined") return;
  const key = slug ? `mtgink_bracket_${slug}` : "mtgink_bracket";
  localStorage.setItem(key, JSON.stringify(state));
}

/** Load bracket from localStorage */
export function loadBracket(slug?: string): BracketState | null {
  if (typeof window === "undefined") return null;
  const key = slug ? `mtgink_bracket_${slug}` : "mtgink_bracket";
  const data = localStorage.getItem(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as BracketState;
  } catch {
    return null;
  }
}

/** Clear bracket from localStorage */
export function clearBracket(slug?: string): void {
  if (typeof window === "undefined") return;
  const key = slug ? `mtgink_bracket_${slug}` : "mtgink_bracket";
  localStorage.removeItem(key);
}
