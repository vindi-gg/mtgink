import type { BracketCard, BracketMatchup, BracketState } from "./types";

/** Valid bracket sizes: must be a power of 2 between 8 and 512 */
const VALID_SIZES = [8, 16, 32, 64, 128, 256, 512];

/** Generate round names based on bracket size */
function buildRoundNames(bracketSize: number): string[] {
  const roundCount = Math.log2(bracketSize);
  const names: string[] = [];
  for (let r = 0; r < roundCount; r++) {
    const remaining = bracketSize / Math.pow(2, r);
    if (remaining === 2) names.push("Final");
    else if (remaining === 4) names.push("Semifinals");
    else if (remaining === 8) names.push("Quarterfinals");
    else names.push(`Round of ${remaining}`);
  }
  return names;
}

/** Create initial bracket state with adjacent pairing */
export function createBracket(cards: BracketCard[]): BracketState {
  if (!VALID_SIZES.includes(cards.length)) {
    throw new Error(`Bracket size must be one of: ${VALID_SIZES.join(", ")}`);
  }

  const roundCount = Math.log2(cards.length);

  // Round 0: bracketSize/2 matchups with adjacent pairing (0v1, 2v3, ...)
  const round0: BracketMatchup[] = [];
  const firstRoundMatchups = cards.length / 2;
  for (let i = 0; i < firstRoundMatchups; i++) {
    round0.push({ index: i, seedA: i * 2, seedB: i * 2 + 1, winner: null });
  }

  // Subsequent rounds: empty matchups, halving each time
  const rounds: BracketMatchup[][] = [round0];
  let matchupCount = firstRoundMatchups / 2;
  for (let r = 1; r < roundCount; r++) {
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

/** Record a vote for a specific matchup (immutable update) */
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

  // Propagate winner to next round
  if (roundIndex < lastRound) {
    const nextRound = roundIndex + 1;
    const nextMatchupIdx = Math.floor(matchupIndex / 2);
    const isFirstOfPair = matchupIndex % 2 === 0;

    if (isFirstOfPair) {
      newRounds[nextRound][nextMatchupIdx].seedA = winnerSeed;
    } else {
      newRounds[nextRound][nextMatchupIdx].seedB = winnerSeed;
    }
  }

  // Check if bracket is complete (final matchup has a winner)
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

/** Get bracket progress info */
export function getBracketProgress(state: BracketState): {
  totalMatchups: number;
  completedMatchups: number;
  roundName: string;
  currentRoundIndex: number;
  roundNames: string[];
  roundProgress: { completed: number; total: number }[];
} {
  const bracketSize = state.cards.length;
  const roundNames = buildRoundNames(bracketSize);
  let completedMatchups = 0;

  const roundProgress = state.rounds.map((round) => {
    const completed = round.filter((m) => m.winner !== null).length;
    completedMatchups += completed;
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
    totalMatchups: bracketSize - 1,
    completedMatchups,
    roundName: roundNames[currentRoundIndex] ?? `Round ${currentRoundIndex}`,
    currentRoundIndex,
    roundNames,
    roundProgress,
  };
}

/** Get human-readable round name */
export function getRoundName(index: number, bracketSize = 32): string {
  const names = buildRoundNames(bracketSize);
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
