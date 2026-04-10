import type { BracketCard, BracketMatchup, BracketState } from "./types";

const isPowerOf2 = (n: number) => n >= 1 && (n & (n - 1)) === 0;

/** Build human-readable names for each round. The first round is labeled
 *  "Initial Round" when the entry count isn't a power of 2; every subsequent
 *  round is a clean power-of-2 size ("Round of 512", "Quarterfinals", etc.). */
function buildRoundNames(state: BracketState): string[] {
  const hasInitialRound = !isPowerOf2(state.cards.length);
  return state.rounds.map((round, i) => {
    if (i === 0 && hasInitialRound) return "Initial Round";
    // After the Initial Round, every round holds a power-of-2 number of
    // participants = round.length * 2.
    const participants = round.length * 2;
    if (participants === 2) return "Final";
    if (participants === 4) return "Semifinals";
    if (participants === 8) return "Quarterfinals";
    return `Round of ${participants}`;
  });
}

/** Create initial bracket state using the Initial Round strategy: one
 *  irregular "play-in" round burns off excess entries so every subsequent
 *  round is a clean power of 2. If the entry count is already a power of 2,
 *  skip the Initial Round entirely.
 *
 *  Example — 597 cards:
 *    target = 512, playInMatches = 85, byes = 427
 *    Round 0: Initial Round, 85 matches (170 play-in cards)
 *    Round 1: Round of 512 = 427 byes + 85 initial-round winners (256 matches)
 *    Round 2: Round of 256 ... Round 9: Final
 *
 *  Callers should pre-shuffle `cards` if the tournament is unseeded — the
 *  first `byes` cards get the byes, the last `2*playInMatches` play in.
 *  Adjacent placement is used: each play-in winner's Round-of-target slot
 *  is fixed at creation time so users can see the full future bracket. */
export function createBracket(cards: BracketCard[]): BracketState {
  if (cards.length < 2) {
    throw new Error("Bracket needs at least 2 cards");
  }

  // A slot in the bracket tree is either:
  //  - a concrete card seed (set at creation time — applies to byes and to
  //    round 0 of a power-of-2 bracket)
  //  - a reference to a previous match whose winner hasn't been decided yet
  type Slot =
    | { kind: "card"; seed: number }
    | { kind: "match"; round: number; matchIdx: number };

  const n = cards.length;
  const target = 1 << Math.floor(Math.log2(n));
  const rounds: BracketMatchup[][] = [];
  let pending: Slot[];

  if (n === target) {
    // Already a power of 2: no Initial Round, every card goes straight in.
    pending = cards.map((_, i) => ({ kind: "card", seed: i }));
  } else {
    // Initial Round burns off the excess.
    const playInMatches = n - target;
    const playInParticipants = playInMatches * 2;
    const byes = n - playInParticipants;

    // Seeds [0, byes) get byes. Seeds [byes, n) play in the Initial Round.
    const initialRound: BracketMatchup[] = [];
    for (let i = 0; i < playInMatches; i++) {
      initialRound.push({
        index: i,
        seedA: byes + i * 2,
        seedB: byes + i * 2 + 1,
        winner: null,
        next: null, // wired up when Round-of-target is built below
      });
    }
    rounds.push(initialRound);

    // Build the pending list for Round of target: byes first, then the
    // Initial Round winners. This is the "adjacent placement" convention —
    // the winner of Initial Round match k goes to a fixed Round-of-target
    // slot, so the full future bracket is visible from the start.
    pending = [];
    for (let i = 0; i < byes; i++) {
      pending.push({ kind: "card", seed: i });
    }
    for (let i = 0; i < playInMatches; i++) {
      pending.push({ kind: "match", round: 0, matchIdx: i });
    }
  }

  // From here on every round halves cleanly. Standard power-of-2 tournament.
  while (pending.length > 1) {
    const currentRoundIdx = rounds.length;
    const round: BracketMatchup[] = [];
    const nextPending: Slot[] = [];

    for (let i = 0; i < pending.length; i += 2) {
      const slotA = pending[i];
      const slotB = pending[i + 1];
      const matchIdx = round.length;

      round.push({
        index: matchIdx,
        seedA: slotA.kind === "card" ? slotA.seed : -1,
        seedB: slotB.kind === "card" ? slotB.seed : -1,
        winner: null,
        next: null,
      });

      // Wire up propagation links for match-reference slots
      if (slotA.kind === "match") {
        const prev = rounds[slotA.round][slotA.matchIdx];
        prev.next = { round: currentRoundIdx, match: matchIdx, slot: "A" };
      }
      if (slotB.kind === "match") {
        const prev = rounds[slotB.round][slotB.matchIdx];
        prev.next = { round: currentRoundIdx, match: matchIdx, slot: "B" };
      }

      nextPending.push({ kind: "match", round: currentRoundIdx, matchIdx });
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

/** Get bracket progress info */
export function getBracketProgress(state: BracketState): {
  totalMatchups: number;
  completedMatchups: number;
  roundName: string;
  currentRoundIndex: number;
  roundNames: string[];
  roundProgress: { completed: number; total: number }[];
} {
  const roundNames = buildRoundNames(state);
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

/** Get human-readable round name by index, assuming a power-of-2 bracket.
 *  Legacy signature kept for BracketDiagram — when the full state isn't
 *  available, we assume the Initial Round isn't in play. */
export function getRoundName(index: number, bracketSize = 32): string {
  // Walk down: bracketSize, bracketSize/2, bracketSize/4, ... 2
  let participants = bracketSize;
  for (let i = 0; i < index; i++) participants = Math.max(2, Math.floor(participants / 2));
  if (participants === 2) return "Final";
  if (participants === 4) return "Semifinals";
  if (participants === 8) return "Quarterfinals";
  return `Round of ${participants}`;
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

/** Bump this any time createBracket's tree shape changes so saved states
 *  from older algorithms don't get restored into a UI that assumes a
 *  different structure. Also bump when a bug might have corrupted seeds
 *  in existing saved states (e.g. the un-vote cascade used the legacy
 *  propagation rule before v3). */
const SAVED_BRACKET_VERSION = 3;

interface SavedBracket {
  v: number;
  state: BracketState;
}

/** Save bracket to localStorage (keyed by optional slug) */
export function saveBracket(state: BracketState, slug?: string): void {
  if (typeof window === "undefined") return;
  const key = slug ? `mtgink_bracket_${slug}` : "mtgink_bracket";
  const payload: SavedBracket = { v: SAVED_BRACKET_VERSION, state };
  localStorage.setItem(key, JSON.stringify(payload));
}

/** Load bracket from localStorage. Returns null if the saved version
 *  doesn't match — older algorithms produced different tree shapes so
 *  restoring them would wire seeds into the wrong matches. */
export function loadBracket(slug?: string): BracketState | null {
  if (typeof window === "undefined") return null;
  const key = slug ? `mtgink_bracket_${slug}` : "mtgink_bracket";
  const data = localStorage.getItem(key);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as SavedBracket | BracketState;
    // Versioned payload
    if (parsed && typeof parsed === "object" && "v" in parsed && "state" in parsed) {
      if ((parsed as SavedBracket).v !== SAVED_BRACKET_VERSION) {
        localStorage.removeItem(key);
        return null;
      }
      return (parsed as SavedBracket).state;
    }
    // Unversioned legacy payload — discard, it's from the old algorithm
    localStorage.removeItem(key);
    return null;
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
