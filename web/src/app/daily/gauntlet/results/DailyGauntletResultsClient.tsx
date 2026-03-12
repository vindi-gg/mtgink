"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("mtgink_session_id") ?? "";
}

export default function DailyGauntletResultsClient({ challengeId }: { challengeId: number }) {
  const [participated, setParticipated] = useState<boolean | null>(null);

  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) {
      setParticipated(false);
      return;
    }

    fetch(`/api/daily/participated?session_id=${sessionId}&ids=${challengeId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((ids: number[]) => {
        setParticipated(ids.includes(challengeId));
      })
      .catch(() => setParticipated(false));
  }, [challengeId]);

  if (participated === null || participated) return null;

  return (
    <Link
      href="/daily/gauntlet"
      className="block mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center hover:bg-amber-500/20 transition-colors"
    >
      <span className="text-amber-400 font-medium text-sm">
        You haven&apos;t played yet — join the gauntlet
      </span>
    </Link>
  );
}
