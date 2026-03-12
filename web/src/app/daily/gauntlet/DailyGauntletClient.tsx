"use client";

import { useState } from "react";
import GauntletView from "@/components/GauntletView";
import DailyResultsPanel from "@/components/DailyResultsPanel";
import type { GauntletResult } from "@/components/GauntletView";
import type { DailyChallenge, DailyChallengeStats, GauntletEntry } from "@/lib/types";

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

interface DailyGauntletClientProps {
  challenge: DailyChallenge;
  pool: GauntletEntry[];
  mode: "remix" | "vs";
}

export default function DailyGauntletClient({ challenge, pool, mode }: DailyGauntletClientProps) {
  const [stats, setStats] = useState<DailyChallengeStats | null>(null);
  const [championId, setChampionId] = useState<string | null>(null);
  const [champWins, setChampWins] = useState(0);

  async function handleComplete(champion: GauntletEntry, championWins: number, results: GauntletResult[]) {
    const champId = mode === "remix" ? champion.illustration_id : champion.oracle_id;
    setChampionId(champId);
    setChampWins(championWins);

    const sessionId = getSessionId();

    try {
      const res = await fetch("/api/daily/gauntlet/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          result: {
            champion_id: champId,
            champion_wins: championWins,
            results: results.map((r) => ({
              id: mode === "remix" ? r.entry.illustration_id : r.entry.oracle_id,
              name: r.entry.name,
              wins: r.wins,
              position: r.position,
            })),
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to record gauntlet:", err);
    }
  }

  const cardName = mode === "remix" && pool.length > 0 ? pool[0].name : undefined;
  const themeLabel = challenge.title !== "Daily Gauntlet" ? challenge.title : undefined;

  return (
    <div className="max-w-4xl mx-auto">
      <GauntletView
        mode={mode}
        pool={pool}
        cardName={cardName}
        themeName={themeLabel}
        dailyChallengeId={challenge.id}
        onComplete={handleComplete}
        hideControls
        fixedOrder
      />

      {stats && (
        <div className="mt-6">
          <DailyResultsPanel
            challenge={challenge}
            stats={stats}
            yourChampionId={championId ?? undefined}
            yourChampionWins={champWins}
          />
        </div>
      )}
    </div>
  );
}
