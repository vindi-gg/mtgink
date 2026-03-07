import type { BracketCard, BracketMatchup, BracketState } from "./types";

const STORAGE_KEY = "mtgink_bracket";

const ROUND_NAMES = [
  "Round of 32",
  "Sweet 16",
  "Elite 8",
  "Final 4",
  "Championship",
];

/** Create initial bracket state with adjacent pairing */
export function createBracket(cards: BracketCard[]): BracketState {
  if (cards.length !== 32) throw new Error("Bracket requires exactly 32 cards");

  // Round 0: 16 matchups (0v1, 2v3, ...)
  const round0: BracketMatchup[] = [];
  for (let i = 0; i < 16; i++) {
    round0.push({ index: i, seedA: i * 2, seedB: i * 2 + 1, winner: null });
  }

  // Rounds 1-4: empty matchups to be filled as winners advance
  const rounds: BracketMatchup[][] = [round0];
  let matchupCount = 8;
  for (let r = 1; r <= 4; r++) {
    const round: BracketMatchup[] = [];
    for (let i = 0; i < matchupCount; i++) {
      round.push({ index: i, seedA: -1, seedB: -1, winner: null });
    }
    rounds.push(round);
    matchupCount /= 2;
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

/** Record a vote and advance the bracket (immutable update) */
export function recordBracketVote(
  state: BracketState,
  winnerSeed: number
): BracketState {
  const { currentRound, currentMatchup } = state;
  const matchup = state.rounds[currentRound][currentMatchup];

  if (winnerSeed !== matchup.seedA && winnerSeed !== matchup.seedB) {
    throw new Error("Winner seed must be one of the matchup participants");
  }

  // Deep clone rounds
  const newRounds = state.rounds.map((round) =>
    round.map((m) => ({ ...m }))
  );

  // Set winner
  newRounds[currentRound][currentMatchup].winner = winnerSeed;

  // Propagate winner to next round
  if (currentRound < 4) {
    const nextRound = currentRound + 1;
    const nextMatchupIdx = Math.floor(currentMatchup / 2);
    const isFirstOfPair = currentMatchup % 2 === 0;

    if (isFirstOfPair) {
      newRounds[nextRound][nextMatchupIdx].seedA = winnerSeed;
    } else {
      newRounds[nextRound][nextMatchupIdx].seedB = winnerSeed;
    }
  }

  // Advance to next matchup
  let nextRound = currentRound;
  let nextMatchup = currentMatchup + 1;
  let completed = false;

  if (nextMatchup >= newRounds[nextRound].length) {
    // Move to next round
    nextRound++;
    nextMatchup = 0;

    if (nextRound > 4) {
      completed = true;
      nextRound = 4;
      nextMatchup = 0;
    }
  }

  return {
    ...state,
    rounds: newRounds,
    currentRound: nextRound,
    currentMatchup: nextMatchup,
    completed,
  };
}

/** Get the two cards for the current matchup, or null if bracket is complete */
export function getCurrentMatchupCards(
  state: BracketState
): { cardA: BracketCard; cardB: BracketCard } | null {
  if (state.completed) return null;

  const matchup = state.rounds[state.currentRound][state.currentMatchup];
  if (matchup.seedA < 0 || matchup.seedB < 0) return null;

  return {
    cardA: state.cards[matchup.seedA],
    cardB: state.cards[matchup.seedB],
  };
}

/** Get the champion card, or null if bracket isn't complete */
export function getChampion(state: BracketState): BracketCard | null {
  if (!state.completed) return null;
  const finalMatchup = state.rounds[4][0];
  if (finalMatchup.winner === null) return null;
  return state.cards[finalMatchup.winner];
}

/** Get bracket progress info */
export function getBracketProgress(state: BracketState): {
  totalMatchups: number;
  completedMatchups: number;
  roundName: string;
  matchupInRound: number;
  matchupsInRound: number;
} {
  let completedMatchups = 0;
  for (const round of state.rounds) {
    for (const m of round) {
      if (m.winner !== null) completedMatchups++;
    }
  }

  return {
    totalMatchups: 31,
    completedMatchups,
    roundName: getRoundName(state.currentRound),
    matchupInRound: state.currentMatchup + 1,
    matchupsInRound: state.rounds[state.currentRound].length,
  };
}

/** Get human-readable round name */
export function getRoundName(index: number): string {
  return ROUND_NAMES[index] ?? `Round ${index}`;
}

/** Save bracket to localStorage */
export function saveBracket(state: BracketState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Load bracket from localStorage */
export function loadBracket(): BracketState | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as BracketState;
  } catch {
    return null;
  }
}

/** Clear bracket from localStorage */
export function clearBracket(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
