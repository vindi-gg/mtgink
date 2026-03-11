"use client";

import { useState, useEffect } from "react";
import DailyChallengeCard from "./DailyChallengeCard";
import type { DailyChallengeWithStatus } from "@/lib/types";

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

export default function DailyChallengesSection() {
  const [challenges, setChallenges] = useState<DailyChallengeWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = getSessionId();
    fetch(`/api/daily?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Sort: remix, vs, gauntlet
          const order = { remix: 0, vs: 1, gauntlet: 2 };
          data.sort((a: DailyChallengeWithStatus, b: DailyChallengeWithStatus) =>
            (order[a.challenge_type] ?? 3) - (order[b.challenge_type] ?? 3));
          setChallenges(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3">
          Today&apos;s Challenges
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[3/4] bg-gray-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (challenges.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3">
        Today&apos;s Challenges
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {challenges.map((c) => (
          <DailyChallengeCard key={c.id} challenge={c} />
        ))}
      </div>
    </div>
  );
}
