"use client";

import { useState, useEffect, useRef } from "react";
import CardImage from "./CardImage";
import FavoriteButton from "./FavoriteButton";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";
import { useFavorites } from "@/hooks/useFavorites";
import type { ComparisonPair, VoteResponse } from "@/lib/types";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("mtgink_session_id");
  if (!id) {
    // crypto.randomUUID() requires HTTPS; fall back for local dev
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("mtgink_session_id", id);
  }
  return id;
}

type ViewMode = "art" | "card" | "both";

function getInitialViewMode(): ViewMode {
  if (typeof window === "undefined") return "art";
  return (localStorage.getItem("mtgink_view_mode") as ViewMode) || "art";
}

interface ComparisonViewProps {
  initialPair: ComparisonPair;
}

export default function ComparisonView({ initialPair }: ComparisonViewProps) {
  const [pair, setPair] = useState<ComparisonPair>(initialPair);
  const [voting, setVoting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const pairRef = useRef(pair);
  const votingRef = useRef(false);
  const { favorites, toggle: toggleFavorite } = useFavorites([
    pair.a.illustration_id,
    pair.b.illustration_id,
  ]);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("mtgink_view_mode", mode);
  }

  pairRef.current = pair;

  async function vote(winnerId: string, loserId: string) {
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oracle_id: pairRef.current.card.oracle_id,
          winner_illustration_id: winnerId,
          loser_illustration_id: loserId,
          session_id: getSessionId(),
        }),
      });

      if (!res.ok) {
        console.error("Vote failed:", res.status, await res.text());
        return;
      }

      const data: VoteResponse = await res.json();
      setPair(data.next);
      pairRef.current = data.next;
    } catch (err) {
      console.error("Vote failed:", err);
    } finally {
      votingRef.current = false;
      setVoting(false);
    }
  }

  async function skip() {
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    try {
      const res = await fetch("/api/compare");
      const data: ComparisonPair = await res.json();
      setPair(data);
      pairRef.current = data;
    } catch (err) {
      console.error("Skip failed:", err);
    } finally {
      votingRef.current = false;
      setVoting(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const p = pairRef.current;
      if (e.key === "ArrowLeft") {
        vote(p.a.illustration_id, p.b.illustration_id);
      } else if (e.key === "ArrowRight") {
        vote(p.b.illustration_id, p.a.illustration_id);
      } else if (e.key === "s" || e.key === "S") {
        skip();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aArt = artCropUrl(pair.a.set_code, pair.a.collector_number);
  const bArt = artCropUrl(pair.b.set_code, pair.b.collector_number);
  const aCard = normalCardUrl(pair.a.set_code, pair.a.collector_number);
  const bCard = normalCardUrl(pair.b.set_code, pair.b.collector_number);

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: "art", label: "Art" },
    { value: "card", label: "Card" },
    { value: "both", label: "Both" },
  ];

  function renderSide(
    side: typeof pair.a,
    otherSide: typeof pair.b,
    artUrl: string,
    cardUrl: string
  ) {
    const handleClick = () =>
      vote(side.illustration_id, otherSide.illustration_id);

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-full">
          {(viewMode === "art" || viewMode === "both") && (
            <CardImage
              key={`${side.illustration_id}-art`}
              src={artUrl}
              alt={`${pair.card.name} art by ${side.artist}`}
              onClick={handleClick}
              className="w-full"
            />
          )}
          {viewMode === "both" && <div className="h-3" />}
          {(viewMode === "card" || viewMode === "both") && (
            <CardImage
              key={`${side.illustration_id}-card`}
              src={cardUrl}
              alt={`${pair.card.name} by ${side.artist}`}
              onClick={handleClick}
              className="w-full"
            />
          )}
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              illustrationId={side.illustration_id}
              oracleId={pair.card.oracle_id}
              isFavorited={favorites.has(side.illustration_id)}
              onToggle={toggleFavorite}
            />
          </div>
        </div>
        <div className="mt-3 text-center">
          <p className="text-sm font-medium text-gray-200">{side.artist}</p>
          <p className="text-xs text-gray-400">
            {side.set_name} ({side.set_code.toUpperCase()})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-center mb-4">
        Which <span className="text-amber-400">{pair.card.name}</span> art do
        you prefer?
      </h2>

      <div className="flex justify-center mb-6">
        <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
          {viewModes.map((m) => (
            <button
              key={m.value}
              onClick={() => changeViewMode(m.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === m.value
                  ? "bg-amber-500 text-gray-900"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {voting && (
        <p className="text-center text-amber-400 text-sm mb-4">Loading next...</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {renderSide(pair.a, pair.b, aArt, aCard)}
        {renderSide(pair.b, pair.a, bArt, bCard)}
      </div>

      <div className="flex justify-center gap-4 mt-6">
        <button
          onClick={skip}
          disabled={voting}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors disabled:opacity-50"
        >
          Skip (S)
        </button>
        <a
          href={`/card/${pair.card.slug}`}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
        >
          See all arts
        </a>
      </div>

      <p className="text-center text-xs text-gray-600 mt-4">
        Use arrow keys to vote, S to skip
      </p>
    </div>
  );
}
