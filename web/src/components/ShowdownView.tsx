"use client";

import { useState, useEffect, useRef } from "react";
import CardImage from "./CardImage";
import CardPreviewOverlay from "./CardPreviewOverlay";
import FavoriteButton from "./FavoriteButton";
import { artCropUrl } from "@/lib/image-utils";
import { useFavorites } from "@/hooks/useFavorites";
import type { ComparisonPair, ClashPair, CompareFilters, VoteResponse, CardVoteResponse } from "@/lib/types";

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

// --- Normalized side type ---

interface ShowdownSide {
  name: string;
  slug: string;
  oracle_id: string;
  illustration_id: string;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_version: string | null;
  type_line: string | null;
  mana_cost: string | null;
}

function normalizePair(raw: ComparisonPair | ClashPair, mode: "remix" | "vs"): [ShowdownSide, ShowdownSide] {
  if (mode === "remix") {
    const p = raw as ComparisonPair;
    const cardA = p.card;
    const cardB = p.card_b ?? p.card;
    return [
      {
        name: cardA.name, slug: cardA.slug, oracle_id: cardA.oracle_id,
        illustration_id: p.a.illustration_id, artist: p.a.artist,
        set_code: p.a.set_code, set_name: p.a.set_name,
        collector_number: p.a.collector_number, image_version: p.a.image_version,
        type_line: cardA.type_line, mana_cost: cardA.mana_cost,
      },
      {
        name: cardB.name, slug: cardB.slug, oracle_id: cardB.oracle_id,
        illustration_id: p.b.illustration_id, artist: p.b.artist,
        set_code: p.b.set_code, set_name: p.b.set_name,
        collector_number: p.b.collector_number, image_version: p.b.image_version,
        type_line: cardB.type_line, mana_cost: cardB.mana_cost,
      },
    ];
  }
  const p = raw as ClashPair;
  const convert = (c: typeof p.a): ShowdownSide => ({
    name: c.name, slug: c.slug, oracle_id: c.oracle_id,
    illustration_id: c.illustration_id, artist: c.artist,
    set_code: c.set_code, set_name: c.set_name,
    collector_number: c.collector_number, image_version: c.image_version,
    type_line: c.type_line, mana_cost: c.mana_cost,
  });
  return [convert(p.a), convert(p.b)];
}

// --- Filter helpers ---

function filtersToParams(filters: CompareFilters): string {
  const params = new URLSearchParams();
  if (filters.colors?.length) params.set("colors", filters.colors.join(","));
  if (filters.type) params.set("type", filters.type);
  if (filters.subtype) params.set("subtype", filters.subtype);
  if (filters.set_code) params.set("set_code", filters.set_code);
  return params.toString();
}

function hasActiveFilters(filters: CompareFilters): boolean {
  return !!((filters.colors && filters.colors.length > 0) || filters.type || filters.subtype || filters.set_code);
}

// --- Component ---

interface ShowdownViewProps {
  mode: "remix" | "vs";
  initialPair: ComparisonPair | ClashPair;
  initialFilters?: CompareFilters;
}

export default function ShowdownView({ mode, initialPair, initialFilters }: ShowdownViewProps) {
  const isRemix = mode === "remix";

  const [sides, setSides] = useState(() => normalizePair(initialPair, mode));
  const [voting, setVoting] = useState(false);
  const [filters] = useState<CompareFilters>(initialFilters ?? {});
  const [filterError, setFilterError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sidesRef = useRef(sides);
  const votingRef = useRef(false);
  const filtersRef = useRef(filters);
  const isFirstPair = useRef(true);

  const [a, b] = sides;
  const sameCard = a.oracle_id === b.oracle_id;

  const { favorites, toggle: toggleFavorite } = useFavorites(
    [a.illustration_id, b.illustration_id],
    isRemix ? "ink" : "clash",
  );

  sidesRef.current = sides;
  filtersRef.current = filters;

  // Update URL with current matchup IDs (skip initial to keep clean URLs)
  useEffect(() => {
    if (isFirstPair.current) {
      isFirstPair.current = false;
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("a", `${sides[0].set_code}-${sides[0].collector_number}`);
    url.searchParams.set("b", `${sides[1].set_code}-${sides[1].collector_number}`);
    window.history.replaceState(null, "", url.toString());
  }, [sides, isRemix]);

  // On mobile, scroll past nav
  useEffect(() => {
    if (window.innerWidth < 768) {
      window.scrollTo({ top: 56, behavior: "instant" });
    }
  }, []);

  // --- API helpers ---

  function compareUrl(f: CompareFilters): string {
    const aq = filtersToParams(f);
    return `/api/showdown/compare?mode=${mode}${aq ? `&${aq}` : ""}`;
  }

  function updateSides(raw: ComparisonPair | ClashPair) {
    const next = normalizePair(raw, mode);
    setSides(next);
    sidesRef.current = next;
  }

  // --- Vote ---

  async function vote(winnerIdx: 0 | 1) {
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    const [sA, sB] = sidesRef.current;
    const winner = winnerIdx === 0 ? sA : sB;
    const loser = winnerIdx === 0 ? sB : sA;

    try {
      const payload = isRemix
        ? {
            mode: "remix",
            oracle_id: winner.oracle_id,
            winner_illustration_id: winner.illustration_id,
            loser_illustration_id: loser.illustration_id,
            session_id: getSessionId(),
            filters: hasActiveFilters(filtersRef.current) ? filtersRef.current : undefined,
          }
        : {
            mode: "vs",
            winner_oracle_id: winner.oracle_id,
            loser_oracle_id: loser.oracle_id,
            session_id: getSessionId(),
            filters: hasActiveFilters(filtersRef.current) ? filtersRef.current : undefined,
          };

      const res = await fetch("/api/showdown/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Vote rejected (e.g. 429) — still fetch a new pair so user isn't stuck
        const fallback = await fetch(compareUrl(filtersRef.current));
        if (fallback.ok) updateSides(await fallback.json());
        return;
      }

      const data = await res.json();
      updateSides(isRemix ? (data as VoteResponse).next : (data as CardVoteResponse).next);
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
      const res = await fetch(compareUrl(filtersRef.current));
      if (res.ok) updateSides(await res.json());
    } catch (err) {
      console.error("Skip failed:", err);
    } finally {
      votingRef.current = false;
      setVoting(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowLeft") vote(0);
      else if (e.key === "ArrowRight") vote(1);
      else if (e.key === "s" || e.key === "S") skip();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Share ---

  function shareUrl(): string {
    return `${window.location.origin}/showdown/${mode}?a=${a.set_code}-${a.collector_number}&b=${b.set_code}-${b.collector_number}`;
  }

  // --- Render side ---

  function renderSide(side: ShowdownSide, sideIdx: 0 | 1) {
    const artUrl = artCropUrl(side.set_code, side.collector_number, side.image_version);
    const handleClick = () => vote(sideIdx);

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-full">
          <CardImage
            key={side.illustration_id}
            src={artUrl}
            alt={`${side.name} by ${side.artist}`}
            onClick={handleClick}
            onImageError={skip}
            className="w-full"
          />
          <CardPreviewOverlay
              setCode={side.set_code}
              collectorNumber={side.collector_number}
              imageVersion={side.image_version}
              alt={`${side.name} by ${side.artist}`}
              illustrationId={side.illustration_id}
              oracleId={side.oracle_id}
              cardName={side.name}
              cardSlug={side.slug}
              isFavorited={favorites.has(side.illustration_id)}
              onToggleFavorite={toggleFavorite}
            />
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              illustrationId={side.illustration_id}
              oracleId={side.oracle_id}
              isFavorited={favorites.has(side.illustration_id)}
              onToggle={toggleFavorite}
            />
          </div>
          <div className="absolute bottom-2 right-2 z-10 text-right">
            {!sameCard && (
              <a href={`/card/${side.slug}`} className="text-xs font-bold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] hover:text-amber-200 transition-colors">{side.name}</a>
            )}
            <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{side.artist}</p>
            <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{side.set_code.toUpperCase()}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Heading */}
      <h2 className="font-bold text-center mb-1 md:mb-2 text-base md:text-lg truncate max-w-full px-2">
        {isRemix ? (
          <>
            Which{" "}
            <a href={`/card/${a.slug}`} className="text-amber-400 hover:text-amber-300">
              {a.name}
            </a>{" "}
            art is best?
          </>
        ) : filters.subtype ? (
          <>Which <span className="text-amber-400 capitalize">{filters.subtype}</span> is best?</>
        ) : filters.type ? (
          <>Which <span className="text-amber-400 capitalize">{filters.type}</span> is best?</>
        ) : filters.set_code ? (
          <>Which <span className="text-amber-400 uppercase">{filters.set_code}</span> card is best?</>
        ) : (
          <>Which card is best?</>
        )}
      </h2>

      {/* Main grid */}
      <div className="relative max-w-4xl mx-auto">
        {voting && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950/60 rounded-lg backdrop-blur-[2px] pointer-events-none">
            <div className="flex items-center gap-2 text-amber-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">Loading next...</span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
          {renderSide(a, 0)}
          {renderSide(b, 1)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-3 mt-4">
        <button
          onClick={skip}
          disabled={voting}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors disabled:opacity-50"
        >
          Skip (S)
        </button>
        {isRemix && sameCard && (
          <a
            href={`/card/${a.slug}`}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
          >
            All arts
          </a>
        )}
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl());
            } catch {
              // Fallback for non-HTTPS contexts
              const input = document.createElement("input");
              input.value = shareUrl();
              document.body.appendChild(input);
              input.select();
              document.execCommand("copy");
              document.body.removeChild(input);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
        >
          {copied ? "Copied!" : "Share"}
        </button>
      </div>

      {!isRemix && hasActiveFilters(filters) && (
        <div className="text-center mt-3">
          <a
            href={`/showdown/vs`}
            className="text-xs text-gray-500 hover:text-amber-400 transition-colors cursor-pointer"
          >
            New theme
          </a>
        </div>
      )}

      {filterError && (
        <p className="text-center text-sm text-red-400 mt-2">{filterError}</p>
      )}

      <p className="text-center text-xs text-gray-600 mt-3">
        Arrow keys to vote, S to skip
      </p>

    </div>
  );
}
