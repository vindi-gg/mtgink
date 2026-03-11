"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import CardImage from "@/components/CardImage";
import CardPreviewOverlay from "@/components/CardPreviewOverlay";
import FavoriteButton from "@/components/FavoriteButton";
import DailyResultsPanel from "@/components/DailyResultsPanel";
import { artCropUrl } from "@/lib/image-utils";
import { useFavorites } from "@/hooks/useFavorites";
import type { ComparisonPair, DailyChallenge, DailyChallengeStats } from "@/lib/types";

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

interface IllustrationMeta {
  illustration_id: string;
  artist: string;
  set_code: string;
  collector_number: string;
  image_version: string | null;
}

interface DailyRemixClientProps {
  challenge: DailyChallenge;
  cardName: string;
  cardSlug: string;
  oracleId: string;
  initialPair: ComparisonPair;
  illustrations: IllustrationMeta[];
  totalIllustrations: number;
}

export default function DailyRemixClient({
  challenge,
  cardName,
  cardSlug,
  oracleId,
  initialPair,
  illustrations,
  totalIllustrations,
}: DailyRemixClientProps) {
  const [pair, setPair] = useState(initialPair);
  const [voting, setVoting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [stats, setStats] = useState<DailyChallengeStats | null>(null);
  const [winnerIllustrationId, setWinnerIllustrationId] = useState<string | null>(null);

  // Track which illustrations have been seen
  const seenRef = useRef(new Set<string>([
    initialPair.a.illustration_id,
    initialPair.b.illustration_id,
  ]));
  const votingRef = useRef(false);

  const votesNeeded = Math.ceil(totalIllustrations / 2);
  const [voteCount, setVoteCount] = useState(0);

  const canComplete = seenRef.current.size >= totalIllustrations;

  const { favorites, toggle: toggleFavorite } = useFavorites(
    [pair.a.illustration_id, pair.b.illustration_id],
    "ink",
  );

  const illustrationMap = new Map(
    illustrations.map((i) => [i.illustration_id, i]),
  );

  async function vote(winnerIdx: 0 | 1) {
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    const winner = winnerIdx === 0 ? pair.a : pair.b;
    const loser = winnerIdx === 0 ? pair.b : pair.a;

    try {
      // Fire vote (don't use its `next` — it picks a random card)
      fetch("/api/showdown/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "remix",
          oracle_id: oracleId,
          winner_illustration_id: winner.illustration_id,
          loser_illustration_id: loser.illustration_id,
          session_id: getSessionId(),
          vote_source: "daily_remix",
        }),
      }).catch(() => {});

      // Fetch next pair locked to this card's oracle_id
      const nextRes = await fetch(`/api/showdown/compare?mode=remix&oracle_id=${oracleId}`);
      if (nextRes.ok) {
        const next = await nextRes.json() as ComparisonPair;
        setPair(next);
        seenRef.current.add(next.a.illustration_id);
        seenRef.current.add(next.b.illustration_id);
      }
      setWinnerIllustrationId(winner.illustration_id);
    } catch (err) {
      console.error("Vote failed:", err);
    } finally {
      votingRef.current = false;
      setVoting(false);
      setVoteCount((c) => c + 1);
    }
  }

  const completeChallenge = useCallback(async () => {
    const sessionId = getSessionId();
    try {
      const res = await fetch("/api/daily/remix/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          result: { winner_illustration_id: winnerIllustrationId ?? pair.a.illustration_id },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setCompleted(true);
      }
    } catch (err) {
      console.error("Failed to complete:", err);
    }
  }, [winnerIllustrationId, pair.a.illustration_id]);

  // Keyboard shortcuts
  useEffect(() => {
    if (completed) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") vote(0);
      else if (e.key === "ArrowRight") vote(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [completed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (completed && stats) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-center mb-1">
          <span className="text-amber-400">Daily Remix</span> — {cardName}
        </h1>
        <p className="text-center text-sm text-gray-400 mb-6">Challenge complete!</p>
        <DailyResultsPanel
          challenge={challenge}
          stats={stats}
          illustrationMeta={illustrationMap}
        />
      </div>
    );
  }

  const a = pair.a;
  const b = pair.b;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-center mb-1">
        <span className="text-amber-400">Daily Remix</span>
        <span className="text-gray-300"> — </span>
        <a href={`/card/${cardSlug}`} className="text-amber-400 hover:text-amber-300">{cardName}</a>
      </h1>

      {/* Progress */}
      <div className="text-center mb-3">
        <div className="inline-flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {seenRef.current.size} of {totalIllustrations} arts seen
          </span>
          <div className="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-300"
              style={{ width: `${(seenRef.current.size / totalIllustrations) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="relative">
        {voting && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950/60 rounded-lg backdrop-blur-[2px] pointer-events-none">
            <div className="flex items-center gap-2 text-amber-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">Loading next...</span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
          {[a, b].map((side, idx) => (
            <div key={side.illustration_id} className="flex flex-col items-center">
              <div className="relative w-full">
                <CardImage
                  key={side.illustration_id}
                  src={artCropUrl(side.set_code, side.collector_number, side.image_version)}
                  alt={`${cardName} by ${side.artist}`}
                  onClick={() => vote(idx as 0 | 1)}
                  className="w-full"
                />
                <CardPreviewOverlay setCode={side.set_code} collectorNumber={side.collector_number} imageVersion={side.image_version} alt={`${cardName} by ${side.artist}`} />
                <div className="absolute top-2 right-2 z-10">
                  <FavoriteButton
                    illustrationId={side.illustration_id}
                    oracleId={side.oracle_id}
                    isFavorited={favorites.has(side.illustration_id)}
                    onToggle={toggleFavorite}
                  />
                </div>
              </div>
              <div className="mt-2 text-center">
                <p className="text-sm font-medium text-gray-200">{side.artist}</p>
                <p className="text-xs text-gray-400">{side.set_name} ({side.set_code.toUpperCase()})</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Complete button */}
      {canComplete && (
        <div className="flex justify-center mt-4">
          <button
            onClick={completeChallenge}
            className="px-6 py-2 text-sm font-bold rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
          >
            Complete Challenge
          </button>
        </div>
      )}

      <p className="text-center text-xs text-gray-600 mt-3">
        Arrow keys to vote{!canComplete && ` · See all ${totalIllustrations} illustrations to complete`}
      </p>
    </div>
  );
}
