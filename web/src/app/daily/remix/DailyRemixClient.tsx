"use client";

import { useState, useEffect } from "react";
import CardImage from "@/components/CardImage";
import CardPreviewOverlay from "@/components/CardPreviewOverlay";
import FavoriteButton from "@/components/FavoriteButton";
import DailyResultsPanel from "@/components/DailyResultsPanel";
import { artCropUrl } from "@/lib/image-utils";
import { useFavorites } from "@/hooks/useFavorites";
import type { DailyChallenge, DailyChallengeStats } from "@/lib/types";

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

interface IllustrationInfo {
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
  illustrationA: IllustrationInfo;
  illustrationB: IllustrationInfo;
}

export default function DailyRemixClient({
  challenge,
  cardName,
  cardSlug,
  oracleId,
  illustrationA,
  illustrationB,
}: DailyRemixClientProps) {
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [stats, setStats] = useState<DailyChallengeStats | null>(null);

  const { favorites, toggle: toggleFavorite } = useFavorites(
    [illustrationA.illustration_id, illustrationB.illustration_id],
    "ink",
  );

  const illustrationMap = new Map([
    [illustrationA.illustration_id, illustrationA],
    [illustrationB.illustration_id, illustrationB],
  ]);

  async function vote(winner: "a" | "b") {
    if (voting || voted) return;
    setVoting(true);

    const sessionId = getSessionId();
    const winnerIll = winner === "a" ? illustrationA : illustrationB;
    const loserIll = winner === "a" ? illustrationB : illustrationA;

    // Fire ELO vote through normal API
    fetch("/api/showdown/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "remix",
        oracle_id: oracleId,
        winner_illustration_id: winnerIll.illustration_id,
        loser_illustration_id: loserIll.illustration_id,
        session_id: sessionId,
        vote_source: "daily_remix",
      }),
    }).catch(() => {});

    // Record daily participation
    try {
      const res = await fetch("/api/daily/remix/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          result: { winner_illustration_id: winnerIll.illustration_id },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to record participation:", err);
    }

    setVoted(true);
    setVoting(false);
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (voted) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") vote("a");
      else if (e.key === "ArrowRight") vote("b");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [voted]); // eslint-disable-line react-hooks/exhaustive-deps

  const sides = [
    { ill: illustrationA, side: "a" as const },
    { ill: illustrationB, side: "b" as const },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-center mb-1">
        <span className="text-amber-400">Daily Remix</span>
        <span className="text-gray-300"> — </span>
        <a href={`/card/${cardSlug}`} className="text-amber-400 hover:text-amber-300">{cardName}</a>
      </h1>
      <p className="text-center text-sm text-gray-400 mb-6">{challenge.description}</p>

      {!voted ? (
        <>
          <div className="relative">
            {voting && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950/60 rounded-lg backdrop-blur-[2px] pointer-events-none">
                <div className="flex items-center gap-2 text-amber-400">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
              {sides.map(({ ill, side }) => (
                <div key={ill.illustration_id} className="flex flex-col items-center">
                  <div className="relative w-full">
                    <CardImage
                      key={ill.illustration_id}
                      src={artCropUrl(ill.set_code, ill.collector_number, ill.image_version)}
                      alt={`${cardName} by ${ill.artist}`}
                      onClick={() => vote(side)}
                      className="w-full"
                    />
                    <CardPreviewOverlay
                      setCode={ill.set_code}
                      collectorNumber={ill.collector_number}
                      imageVersion={ill.image_version}
                      alt={`${cardName} by ${ill.artist}`}
                      illustrationId={ill.illustration_id}
                      oracleId={oracleId}
                      cardName={cardName}
                      cardSlug={cardSlug}
                      isFavorited={favorites.has(ill.illustration_id)}
                      onToggleFavorite={toggleFavorite}
                    />
                    <div className="absolute top-2 right-2 z-10">
                      <FavoriteButton
                        illustrationId={ill.illustration_id}
                        oracleId={oracleId}
                        isFavorited={favorites.has(ill.illustration_id)}
                        onToggle={toggleFavorite}
                      />
                    </div>
                    <div className="absolute bottom-2 right-2 z-10 text-right">
                      <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{ill.artist}</p>
                      <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{ill.set_code.toUpperCase()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-gray-600 mt-4">Click to pick your favorite art</p>
        </>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6 opacity-60">
            {sides.map(({ ill }) => (
              <div key={ill.illustration_id} className="flex flex-col items-center">
                <div className="relative w-full">
                  <img
                    src={artCropUrl(ill.set_code, ill.collector_number, ill.image_version)}
                    alt={`${cardName} by ${ill.artist}`}
                    className="w-full rounded-[5%]"
                  />
                  <div className="absolute bottom-2 right-2 text-right">
                    <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{ill.artist}</p>
                    <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{ill.set_code.toUpperCase()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {stats && (
            <DailyResultsPanel
              challenge={challenge}
              stats={stats}
              illustrationMeta={illustrationMap}
            />
          )}
        </div>
      )}
    </div>
  );
}
