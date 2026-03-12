"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GauntletView from "@/components/GauntletView";
import type { GauntletResult } from "@/components/GauntletView";
import type { DailyChallenge, GauntletEntry } from "@/lib/types";

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
  const router = useRouter();
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if already participated — redirect to results
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
          router.replace("/daily/gauntlet/results");
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [challenge.id, router]);

  async function handleComplete(_champion: GauntletEntry, _championWins: number, _results: GauntletResult[]) {
    // Redirect to results page after a brief delay for stats to update
    setTimeout(() => {
      router.push("/daily/gauntlet/results");
    }, 500);
  }

  if (checking) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  // Already completed — will redirect to results
  if (alreadyDone) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-400 text-sm">Redirecting to results...</p>
      </div>
    );
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
    </div>
  );
}
