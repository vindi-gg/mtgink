"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import BracketFillView from "@/components/BracketFillView";
import { createClient } from "@/lib/supabase/client";
import { getChampion } from "@/lib/bracket-logic";
import type { BracketCard, BracketState, DailyChallenge } from "@/lib/types";

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

interface DailyBracketClientProps {
  challenge: DailyChallenge;
  cards: BracketCard[];
}

/** Live countdown to the next 6 AM UTC. Updates every minute. */
function CountdownTo6amUTC() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function update() {
      const now = new Date();
      const target = new Date(now);
      // If it's already past 6 AM UTC today, target tomorrow.
      if (now.getUTCHours() >= 6) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      target.setUTCHours(6, 0, 0, 0);

      const diff = target.getTime() - now.getTime();
      if (diff <= 0) {
        setLabel("Results are live!");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setLabel(`${h}h ${m}m`);
    }
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return <span>{label}</span>;
}

export default function DailyBracketClient({ challenge, cards }: DailyBracketClientProps) {
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const submittedRef = useRef(false);

  // Check auth for the sign-in prompt on the champion screen.
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user));
  }, []);

  // Check if already participated — show "already done" state instead
  // of letting them play again. No redirect; they see the champion view.
  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) {
      setChecking(false);
      return;
    }
    fetch(`/api/daily/participated?session_id=${sessionId}&ids=${challenge.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((ids: number[]) => {
        if (ids.includes(challenge.id)) {
          setAlreadyDone(true);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [challenge.id]);

  // On bracket completion: record daily participation + ELO + My Brackets save.
  const handleComplete = useCallback(
    async (state: BracketState) => {
      if (submittedRef.current) return;
      submittedRef.current = true;

      const champ = getChampion(state);
      if (!champ) return;

      const sessionId = getSessionId();

      // Build per-matchup vote data for the consensus bracket aggregation.
      const matchups: Array<{
        round: number;
        match: number;
        winner_seed: number;
        winner_illustration_id: string;
        loser_illustration_id: string;
      }> = [];
      for (const [rIdx, round] of state.rounds.entries()) {
        for (const m of round) {
          if (m.winner === null || m.seedA < 0 || m.seedB < 0) continue;
          const loserSeed = m.winner === m.seedA ? m.seedB : m.seedA;
          matchups.push({
            round: rIdx,
            match: m.index,
            winner_seed: m.winner,
            winner_illustration_id: state.cards[m.winner].illustration_id,
            loser_illustration_id: state.cards[loserSeed].illustration_id,
          });
        }
      }

      const dailyResult = {
        type: "bracket",
        champion_illustration_id: champ.illustration_id,
        champion_oracle_id: champ.oracle_id,
        champion_name: champ.name,
        card_count: state.cards.length,
        matchups,
      };

      // Build ELO matchups (same format as /api/bracket/complete).
      const eloMatchups = matchups.map((m) => ({
        winner_illustration_id: m.winner_illustration_id,
        loser_illustration_id: m.loser_illustration_id,
        winner_oracle_id: state.cards[m.winner_seed].oracle_id,
        loser_oracle_id:
          state.cards[
            m.winner_seed === state.rounds[m.round][m.match].seedA
              ? state.rounds[m.round][m.match].seedB
              : state.rounds[m.round][m.match].seedA
          ].oracle_id,
      }));

      // Fire all three calls in parallel — daily participation, ELO, My Brackets save.
      const completeFetch = fetch("/api/daily/bracket/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, result: dailyResult }),
      });
      const eloFetch = fetch("/api/bracket/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          matchups: eloMatchups,
          brew_slug: null,
        }),
      });
      const saveFetch = fetch("/api/bracket/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brew_slug: null,
          brew_name: `Daily Bracket: ${challenge.title}`,
          card_count: state.cards.length,
          champion: {
            oracle_id: champ.oracle_id,
            illustration_id: champ.illustration_id,
            name: champ.name,
            artist: champ.artist,
            set_code: champ.set_code,
            collector_number: champ.collector_number,
            image_version: champ.image_version,
            slug: champ.slug,
          },
        }),
      });

      await Promise.allSettled([completeFetch, eloFetch, saveFetch]);
      // Stay on the champion screen — no redirect. The championExtra
      // prop shows the "come back tomorrow" countdown.
    },
    [challenge],
  );

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  // Already completed today — still show the bracket (they can browse
  // their results), but with the countdown message instead of vote UI.
  // BracketFillView will load their saved progress from localStorage.

  // Strip " Bracket" suffix for the display name.
  const displayTitle = challenge.title?.replace(/\s+Bracket$/i, "").trim();
  const bracketName = displayTitle
    ? `Daily: ${displayTitle}`
    : "Daily Bracket";

  const dailyChampionExtra = (
    <div className="mt-6 max-w-md mx-auto px-2 text-center space-y-3">
      {!isLoggedIn && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left">
          <p className="text-sm text-amber-100 mb-2">
            Sign in to save this bracket to your account and track your history.
          </p>
          <Link
            href="/auth"
            className="inline-block px-3 py-1.5 rounded-lg bg-amber-500 text-gray-900 text-xs font-semibold hover:bg-amber-400 transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <p className="text-sm text-amber-100 font-medium mb-1">
          Come back tomorrow to see the community results!
        </p>
        <p className="text-[11px] text-amber-200/50 mb-1">
          {cards.length}-card bracket · {cards.length - 1} matchups
        </p>
        <p className="text-xs text-amber-300/70">
          Results go live at 6 AM UTC — <CountdownTo6amUTC />
        </p>
      </div>
      <a
        href="/daily/bracket/results"
        className="inline-block text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        View current standings
      </a>
    </div>
  );

  return (
    <BracketFillView
      cards={cards}
      slug={`daily-bracket-${challenge.id}`}
      bracketName={bracketName}
      onComplete={handleComplete}
      disableAutoSave
      championExtra={dailyChampionExtra}
    />
  );
}
