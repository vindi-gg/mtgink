"use client";

import { useState } from "react";
import CardImage from "@/components/CardImage";
import CardPreviewOverlay from "@/components/CardPreviewOverlay";
import DailyResultsPanel from "@/components/DailyResultsPanel";
import { useImageMode } from "@/lib/image-mode";
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
  artist: string;
}

interface DailyVsClientProps {
  challenge: DailyChallenge;
  cardA: OracleCard;
  cardB: OracleCard;
  printingA: PrintingInfo;
  printingB: PrintingInfo;
}

export default function DailyVsClient({ challenge, cardA, cardB, printingA, printingB }: DailyVsClientProps) {
  const { imageMode, cardUrl } = useImageMode();
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

  const imgA = cardUrl(printingA.set_code, printingA.collector_number, printingA.image_version);
  const imgB = cardUrl(printingB.set_code, printingB.collector_number, printingB.image_version);

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
            <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
              {[
                { card: cardA, printing: printingA, img: imgA, side: "a" as const, illId: challenge.illustration_id_a },
                { card: cardB, printing: printingB, img: imgB, side: "b" as const, illId: challenge.illustration_id_b },
              ].map(({ card, printing, img, side, illId }) => (
                <div key={side} className="flex flex-col items-center">
                  <div className="relative w-full">
                    <CardImage src={img} alt={card.name} onClick={() => vote(side)} className="w-full" />
                    {imageMode !== "card" && (
                      <CardPreviewOverlay
                        setCode={printing.set_code}
                        collectorNumber={printing.collector_number}
                        imageVersion={printing.image_version}
                        alt={card.name}
                        illustrationId={illId ?? undefined}
                        oracleId={card.oracle_id}
                        cardName={card.name}
                        cardSlug={card.slug}
                      />
                    )}
                    {imageMode !== "card" && (
                      <div className="absolute bottom-2 right-2 z-10 text-right">
                        <a href={`/card/${card.slug}`} className="text-xs font-bold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] hover:text-amber-200 transition-colors">{card.name}</a>
                        <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{printing.artist}</p>
                        <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{printing.set_code.toUpperCase()}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-gray-600 mt-4">Click to pick your winner</p>
        </>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6 opacity-60">
            {[
              { card: cardA, printing: printingA, img: imgA },
              { card: cardB, printing: printingB, img: imgB },
            ].map(({ card, printing, img }) => (
              <div key={card.oracle_id} className="flex flex-col items-center">
                <div className="relative w-full">
                  <img src={img} alt={card.name} className="w-full rounded-[5%]" />
                  <div className="absolute bottom-2 right-2 text-right">
                    <span className="text-xs font-bold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.name}</span>
                    <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{printing.artist}</p>
                    <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{printing.set_code.toUpperCase()}</p>
                  </div>
                </div>
              </div>
            ))}
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
