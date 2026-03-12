"use client";

import { useState, useEffect } from "react";
import DailyChallengeCard from "./DailyChallengeCard";
import type { DailyChallenge, DailyChallengeStats } from "@/lib/types";

interface DailyChallengesSectionProps {
  challenges: (DailyChallenge & { stats: DailyChallengeStats })[];
}

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

export default function DailyChallengesSection({ challenges }: DailyChallengesSectionProps) {
  const [participated, setParticipated] = useState<Set<number>>(new Set());

  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId || challenges.length === 0) return;

    const ids = challenges.map((c) => c.id).join(",");
    fetch(`/api/daily/participated?session_id=${sessionId}&ids=${ids}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setParticipated(new Set(data));
      })
      .catch(() => {});
  }, [challenges]);

  if (challenges.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3">
        Today&apos;s Challenges
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {challenges.map((c) => (
          <DailyChallengeCard
            key={c.id}
            challenge={{ ...c, participated: participated.has(c.id) }}
          />
        ))}
      </div>
    </div>
  );
}
