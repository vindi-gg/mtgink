"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DailyChallengeCard from "./DailyChallengeCard";
import type { DailyChallenge, DailyChallengeStats } from "@/lib/types";

function isGiveawayVisible(): boolean {
  const now = new Date();
  if (now.getFullYear() !== 2026) return false;
  const month = now.getMonth(); // 0-indexed
  return month === 2 || month === 3; // March (preview) + April (active)
}

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
  const [showGiveaway, setShowGiveaway] = useState(false);
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    setShowPromo(isGiveawayVisible());
  }, []);

  const closeModal = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setShowGiveaway(false);
  }, []);

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

      {showPromo && (
        <button
          onClick={() => setShowGiveaway(true)}
          className="mt-3 w-full rounded-xl ring-1 ring-amber-500/30 hover:ring-2 hover:ring-amber-500 bg-zinc-900/80 px-4 py-3 text-center text-sm text-amber-400/80 hover:text-amber-400 transition-all cursor-pointer"
        >
          🎁 Win a Secrets of Strixhaven Booster Box — sign in &amp; complete today&apos;s gauntlet for entry!
          <br />
          <span className="underline text-xs text-zinc-400">Rules &amp; details</span>
        </button>
      )}

      {showGiveaway && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeModal}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.ctfassets.net/s5n2t79q9icq/1dXrxQiquqPnIvRKifelgl/6f71c8267eaf3477101d6882d5e4b4fb/SOS_BHDNDKDJDHOW_Play_EN.png?fm=webp"
              alt="Secrets of Strixhaven Play Booster Box"
              className="w-full"
            />
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-3">
                🎁 April Giveaway
              </h3>
              <div className="space-y-3 text-sm text-zinc-300">
                <p>
                  <span className="text-white font-semibold">Prize:</span>{" "}
                  Secrets of Strixhaven Play Booster Box (~$150 value)
                </p>
                <p>
                  <span className="text-white font-semibold">How to enter:</span>{" "}
                  Sign in and complete the daily gauntlet — each completion = one entry.
                </p>
                <p>
                  <span className="text-white font-semibold">Duration:</span>{" "}
                  April 1–30, 2026. Winner drawn May 1, 2026.
                </p>
                <p>
                  <span className="text-white font-semibold">Eligibility:</span>{" "}
                  US &amp; Canada (excl. Quebec), 18+
                </p>
                <p className="text-xs text-zinc-500 uppercase">
                  No purchase necessary.
                </p>
                <Link
                  href="/giveaway/rules"
                  className="inline-block text-amber-400 hover:text-amber-300 underline text-xs"
                >
                  Official Rules
                </Link>
              </div>
              <button
                onClick={() => setShowGiveaway(false)}
                className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
