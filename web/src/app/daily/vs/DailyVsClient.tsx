"use client";

import { useState } from "react";
import CardImage from "@/components/CardImage";
import CardPreviewOverlay from "@/components/CardPreviewOverlay";
import DailyResultsPanel from "@/components/DailyResultsPanel";
import { artCropUrl } from "@/lib/image-utils";
import type { DailyChallenge, DailyChallengeStats, OracleCard } from "@/lib/types";

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

interface PrintingInfo {
  set_code: string;
  collector_number: string;
  image_version: string | null;
}

interface DailyVsClientProps {
  challenge: DailyChallenge;
  cardA: OracleCard;
  cardB: OracleCard;
  printingA: PrintingInfo;
  printingB: PrintingInfo;
}

export default function DailyVsClient({ challenge, cardA, cardB, printingA, printingB }: DailyVsClientProps) {
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [stats, setStats] = useState<DailyChallengeStats | null>(null);

  async function vote(winner: "a" | "b") {
    if (voting || voted) return;
    setVoting(true);

    const sessionId = getSessionId();

    const winnerOracleId = winner === "a" ? challenge.oracle_id_a : challenge.oracle_id_b;
    const loserOracleId = winner === "a" ? challenge.oracle_id_b : challenge.oracle_id_a;

    // Fire vote through normal API
    fetch("/api/showdown/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "vs",
        winner_oracle_id: winnerOracleId,
        loser_oracle_id: loserOracleId,
        session_id: sessionId,
        vote_source: "daily_vs",
      }),
    }).catch(() => {});

    // Record daily participation
    try {
      const res = await fetch("/api/daily/vs/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          result: { winner },
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

  const imgA = artCropUrl(printingA.set_code, printingA.collector_number, printingA.image_version);
  const imgB = artCropUrl(printingB.set_code, printingB.collector_number, printingB.image_version);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-center mb-1">
        <span className="text-amber-400">Daily VS</span>
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
            <div className="grid grid-cols-2 gap-2 md:gap-6">
              <div className="flex flex-col items-center">
                <a href={`/card/${cardA.slug}`} className="text-xs font-bold text-amber-400 hover:text-amber-300 mb-1 transition-colors truncate max-w-full">
                  {cardA.name}
                </a>
                <div className="relative w-full">
                  <CardImage src={imgA} alt={cardA.name} onClick={() => vote("a")} className="w-full" />
                  <CardPreviewOverlay setCode={printingA.set_code} collectorNumber={printingA.collector_number} imageVersion={printingA.image_version} alt={cardA.name} />
                </div>
              </div>
              <div className="flex flex-col items-center">
                <a href={`/card/${cardB.slug}`} className="text-xs font-bold text-amber-400 hover:text-amber-300 mb-1 transition-colors truncate max-w-full">
                  {cardB.name}
                </a>
                <div className="relative w-full">
                  <CardImage src={imgB} alt={cardB.name} onClick={() => vote("b")} className="w-full" />
                  <CardPreviewOverlay setCode={printingB.set_code} collectorNumber={printingB.collector_number} imageVersion={printingB.image_version} alt={cardB.name} />
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-gray-600 mt-4">Click to pick your winner</p>
        </>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 md:gap-6 opacity-60">
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-gray-400 mb-1">{cardA.name}</span>
              <img src={imgA} alt={cardA.name} className="w-full rounded-[5%]" />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-gray-400 mb-1">{cardB.name}</span>
              <img src={imgB} alt={cardB.name} className="w-full rounded-[5%]" />
            </div>
          </div>
          {stats && (
            <DailyResultsPanel
              challenge={challenge}
              stats={stats}
              cardNameA={cardA.name}
              cardNameB={cardB.name}
            />
          )}
        </div>
      )}
    </div>
  );
}
