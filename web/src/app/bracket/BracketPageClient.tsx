"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import BracketFillView from "@/components/BracketFillView";
import type { BracketCard, BracketState, Brew, GauntletEntry } from "@/lib/types";

const RANDOM_STORAGE_KEY = "mtgink_bracket_cards";
const RANDOM_BRACKET_SIZE = 8;

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("mtgink_session_id");
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("mtgink_session_id", id);
  }
  return id;
}

/** Convert a GauntletEntry (brew pool entry) into a BracketCard */
function entryToBracketCard(entry: GauntletEntry): BracketCard {
  return {
    oracle_id: entry.oracle_id,
    name: entry.name,
    slug: entry.slug,
    type_line: entry.type_line,
    artist: entry.artist,
    set_code: entry.set_code,
    set_name: entry.set_name,
    collector_number: entry.collector_number,
    illustration_id: entry.illustration_id,
    image_version: entry.image_version,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function BracketPageClient() {
  const searchParams = useSearchParams();
  const brewSlug = searchParams.get("brew");

  const [cards, setCards] = useState<BracketCard[] | null>(null);
  const [slug, setSlug] = useState<string>("test");
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Brew-backed bracket
      if (brewSlug) {
        try {
          const res = await fetch(`/api/brew/${brewSlug}`);
          if (!res.ok) throw new Error("Brew not found");
          const brew = (await res.json()) as Brew;

          if (brew.mode !== "bracket") {
            throw new Error("This brew is not a bracket");
          }
          if (!brew.bracket_size || !brew.pool || brew.pool.length < brew.bracket_size) {
            throw new Error("Brew pool is too small for its bracket size");
          }

          const localSlug = `brew-${brewSlug}`;

          // Reuse the same shuffled card order on refresh so saved bracket
          // progress lines up. Only reshuffle if we've never played this brew.
          const cardsKey = `mtgink_bracket_cards_${localSlug}`;
          let picked: BracketCard[] | null = null;
          const savedCardsJson = typeof window !== "undefined" ? localStorage.getItem(cardsKey) : null;
          if (savedCardsJson) {
            try {
              const parsed = JSON.parse(savedCardsJson) as BracketCard[];
              if (Array.isArray(parsed) && parsed.length === brew.bracket_size) {
                picked = parsed;
              }
            } catch {
              /* ignore, reshuffle below */
            }
          }
          if (!picked) {
            picked = shuffle(brew.pool).slice(0, brew.bracket_size).map(entryToBracketCard);
            if (typeof window !== "undefined") {
              localStorage.setItem(cardsKey, JSON.stringify(picked));
            }
            // First time playing this brew — increment play count
            fetch(`/api/brew/${brewSlug}/play`, { method: "POST" }).catch(() => {});
          }

          if (!cancelled) {
            setSlug(localSlug);
            setCards(picked);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load brew");
          }
        }
        return;
      }

      // Random bracket (default)
      const saved = localStorage.getItem(RANDOM_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as BracketCard[];
          if (parsed.length === RANDOM_BRACKET_SIZE) {
            if (!cancelled) {
              setSlug("test");
              setCards(parsed);
            }
            return;
          }
        } catch {
          /* ignore */
        }
      }

      try {
        const res = await fetch(`/api/bracket?count=${RANDOM_BRACKET_SIZE}`);
        const data = await res.json();
        const c = data.cards as BracketCard[];
        localStorage.setItem(RANDOM_STORAGE_KEY, JSON.stringify(c));
        if (!cancelled) {
          setSlug("test");
          setCards(c);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load bracket");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brewSlug]);

  const handleComplete = useCallback(async (state: BracketState) => {
    // Guard against double-submit (effect may fire twice in dev/strict mode)
    const key = `bracket_submitted_${slug}`;
    if (submittedRef.current) return;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    submittedRef.current = true;

    // Flatten all matchups in round order so later rounds see earlier ELO updates
    const matchups: Array<{
      winner_illustration_id: string;
      loser_illustration_id: string;
      winner_oracle_id: string;
      loser_oracle_id: string;
    }> = [];

    for (const round of state.rounds) {
      for (const m of round) {
        if (m.winner === null || m.seedA < 0 || m.seedB < 0) continue;
        const winnerIdx = m.winner;
        const loserIdx = winnerIdx === m.seedA ? m.seedB : m.seedA;
        const winnerCard = state.cards[winnerIdx];
        const loserCard = state.cards[loserIdx];
        if (!winnerCard || !loserCard) continue;
        matchups.push({
          winner_illustration_id: winnerCard.illustration_id,
          loser_illustration_id: loserCard.illustration_id,
          winner_oracle_id: winnerCard.oracle_id,
          loser_oracle_id: loserCard.oracle_id,
        });
      }
    }

    if (matchups.length === 0) return;

    try {
      const res = await fetch("/api/bracket/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: getSessionId(),
          matchups,
          brew_slug: brewSlug ?? null,
        }),
      });
      if (res.ok && typeof window !== "undefined") {
        sessionStorage.setItem(key, "1");
      } else if (!res.ok) {
        submittedRef.current = false;
      }
    } catch {
      submittedRef.current = false;
    }
  }, [slug, brewSlug]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!cards) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-2 text-amber-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading bracket...</span>
        </div>
      </div>
    );
  }

  return <BracketFillView cards={cards} slug={slug} onComplete={handleComplete} />;
}
