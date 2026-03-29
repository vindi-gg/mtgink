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

export default function DailyChallengesSection({ challenges: serverChallenges }: DailyChallengesSectionProps) {
  const [challenges, setChallenges] = useState(serverChallenges);
  const [participated, setParticipated] = useState<Set<number>>(new Set());

  // Fetch fresh challenges client-side to avoid ISR/router-cache staleness
  useEffect(() => {
    const sessionId = getSessionId();
    const url = sessionId ? `/api/daily?session_id=${sessionId}` : `/api/daily`;

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          setChallenges(data);
          const done = new Set<number>(
            data.filter((c: DailyChallenge & { participated?: boolean }) => c.participated).map((c: DailyChallenge) => c.id)
          );
          setParticipated(done);
        }
      })
      .catch(() => {});
  }, []);

  if (challenges.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3">
        Today&apos;s Challenge
      </h2>
      {challenges.map((c) => (
        <DailyChallengeCard
          key={c.id}
          challenge={{ ...c, participated: participated.has(c.id) }}
        />
      ))}
    </div>
  );
}
