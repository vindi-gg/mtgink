/**
 * Completed-bracket history.
 *
 * Two storage paths:
 *  - Anon users: localStorage on this device (see save/load/clear below).
 *  - Logged-in users: Supabase `saved_brackets` table, via
 *    /api/bracket/save (POST) and /api/bracket/saved (GET).
 *
 * BracketFillView picks the path based on auth state on completion.
 * /my/brackets picks the path based on auth state on page load.
 *
 * Both paths return the same `BracketHistoryEntry` shape so the
 * rendering layer doesn't need to branch.
 */

/** Minimal champion metadata needed to render a /my/brackets row. */
export interface ChampionSummary {
  oracle_id: string;
  illustration_id: string;
  name: string;
  artist: string;
  set_code: string;
  collector_number: string;
  image_version: string | null;
  slug: string;
}

export interface BracketHistoryEntry {
  id: string;
  brewSlug: string | null;
  brewName: string | null;
  champion: ChampionSummary;
  completedAt: string; // ISO datetime
  cardCount: number;
}

const HISTORY_KEY = "mtgink_bracket_history";
const MAX_HISTORY = 100;

/** Anon path: append a completed bracket to localStorage. */
export function saveCompletedBracketLocal(
  entry: Omit<BracketHistoryEntry, "id" | "completedAt">,
): BracketHistoryEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = loadBracketHistoryLocal();
    const newEntry: BracketHistoryEntry = {
      ...entry,
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      completedAt: new Date().toISOString(),
    };
    const updated = [newEntry, ...existing].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return newEntry;
  } catch {
    return null;
  }
}

/** Anon path: read completed brackets from localStorage. */
export function loadBracketHistoryLocal(): BracketHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function clearBracketHistoryLocal(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}
