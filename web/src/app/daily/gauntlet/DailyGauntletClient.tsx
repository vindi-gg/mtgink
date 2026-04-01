"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GauntletView from "@/components/GauntletView";
import { artCropUrl } from "@/lib/image-utils";
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

const IRREGULAR_PLURALS: Record<string, string> = {
  Elf: "Elves", Dwarf: "Dwarves", Wolf: "Wolves", Ox: "Oxen",
  Mouse: "Mice", Goose: "Geese", Fungus: "Fungi", Cyclops: "Cyclopes",
  Fish: "Fish", Sheep: "Sheep", Moose: "Moose", Homunculus: "Homunculi",
  Octopus: "Octopi", Locus: "Loci", Hippopotamus: "Hippopotami",
};

function pluralize(word: string): string {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return word + "es";
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  if (/f$/i.test(word)) return word.slice(0, -1) + "ves";
  if (/fe$/i.test(word)) return word.slice(0, -2) + "ves";
  return word + "s";
}

interface DailyGauntletClientProps {
  challenge: DailyChallenge;
  pool: GauntletEntry[];
  mode: "remix" | "vs";
  themeLink?: { label: string; href: string };
}

export default function DailyGauntletClient({ challenge, pool, mode, themeLink }: DailyGauntletClientProps) {
  const router = useRouter();
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [checking, setChecking] = useState(true);
  const [justFinished, setJustFinished] = useState(false);
  const [champion, setChampion] = useState<GauntletEntry | null>(null);
  const [champWins, setChampWins] = useState(0);

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

  async function handleComplete(champ: GauntletEntry, wins: number, _results: GauntletResult[]) {
    setChampion(champ);
    setChampWins(wins);
    setJustFinished(true);
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

  // Just finished — show user's champion and link to community results
  if (justFinished && champion) {
    return (
      <div className="max-w-md mx-auto text-center py-8">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
          {challenge.title}
        </p>
        <h2 className="text-xl font-bold text-amber-400 mb-4">Your Champion</h2>
        <div className="inline-block mb-4">
          <img
            src={artCropUrl(champion.set_code, champion.collector_number, champion.image_version)}
            alt={champion.name}
            className="w-48 h-36 object-cover rounded-lg ring-2 ring-amber-500/50 mx-auto"
          />
          <p className="text-lg font-bold text-gray-200 mt-2">{champion.name}</p>
          <p className="text-sm text-gray-400">
            {champWins} win{champWins !== 1 ? "s" : ""} in a row
          </p>
        </div>
        <div className="mt-4">
          <Link
            href="/daily/gauntlet/results"
            className="inline-block px-6 py-2.5 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors"
          >
            See Community Results
          </Link>
        </div>
      </div>
    );
  }

  const cardName = mode === "remix" && pool.length > 0 ? pool[0].name : undefined;
  // Strip " Gauntlet" / " Remix" suffix from theme label (stored as "Wolf Gauntlet" etc.)
  const cleanTitle = challenge.title
    ?.replace(/\s+(Gauntlet|Remix)$/i, "")
    ?.trim();
  const rawLabel = cleanTitle && cleanTitle !== "Daily" ? cleanTitle : undefined;
  const themeLabel = rawLabel
    ? mode === "remix"
      ? `Daily Gauntlet: ${rawLabel}`
      : `Daily Gauntlet: ${pluralize(rawLabel)}`
    : "Daily Gauntlet";

  return (
    <div>
      <GauntletView
        mode={mode}
        pool={pool}
        cardName={cardName}
        themeName={themeLabel}
        themeLink={themeLink}
        dailyChallengeId={challenge.id}
        onComplete={handleComplete}
        hideControls
        fixedOrder
      />
    </div>
  );
}
