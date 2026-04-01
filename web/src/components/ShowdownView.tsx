"use client";

import { useState, useEffect, useRef } from "react";
import CardImage from "./CardImage";
import VoteGrid from "./VoteGrid";
import type { VoteGridHandle } from "./VoteGrid";
import CardPreviewOverlay from "./CardPreviewOverlay";
import FavoriteButton from "./FavoriteButton";
import ShowdownSubnav, { ShowdownSidebar } from "./ShowdownSubnav";
import type { ThemeRotation, VsThemeType } from "./ShowdownSubnav";
import { VS_THEME_TYPES } from "./ShowdownSubnav";
import { artCropUrl } from "@/lib/image-utils";
import { useImageMode } from "@/lib/image-mode";
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
  themeLabel?: string;
}

export default function ShowdownView({ mode, initialPair, initialFilters, themeLabel }: ShowdownViewProps) {
  const { imageMode, cardUrl, toggleImageMode } = useImageMode();
  const isRemix = mode === "remix";

  const [sides, setSides] = useState(() => normalizePair(initialPair, mode));
  const [voting, setVoting] = useState(false);
  const [filters, setFilters] = useState<CompareFilters>(initialFilters ?? {});
  const [filterError, setFilterError] = useState<string | null>(null);
  const [currentThemeLabel, setCurrentThemeLabel] = useState(themeLabel);
  const voteGridRef = useRef<VoteGridHandle>(null);

  // Theme rotation (VS only)
  const [themeRotation, setThemeRotation] = useState<ThemeRotation>(() => {
    if (typeof window === "undefined") return "every";
    return (localStorage.getItem("mtgink_theme_rotation") as ThemeRotation) || "every";
  });
  const [themeTypes, setThemeTypes] = useState<VsThemeType[]>(() => {
    if (typeof window === "undefined") return ["tribe"];
    const saved = localStorage.getItem("mtgink_theme_types");
    if (saved) try { return JSON.parse(saved); } catch { /* ignore */ }
    return ["tribe"];
  });
  const themeTypesRef = useRef(themeTypes);
  themeTypesRef.current = themeTypes;
  const voteCountRef = useRef(0);

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

  // Persist theme/filters in URL so refresh preserves them
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    if (filters.subtype && !url.searchParams.has("subtype")) {
      url.searchParams.set("subtype", filters.subtype);
      if (filters.type) url.searchParams.set("type", filters.type);
      changed = true;
    }
    if (filters.set_code && !url.searchParams.has("set_code")) {
      url.searchParams.set("set_code", filters.set_code);
      changed = true;
    }
    if (changed) window.history.replaceState(null, "", url.toString());
  }, []);

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
    voteGridRef.current?.resetSelection();
  }

  function handleThemeRotationChange(value: ThemeRotation) {
    setThemeRotation(value);
    localStorage.setItem("mtgink_theme_rotation", value);
    voteCountRef.current = 0;
  }

  function handleThemeTypesChange(types: VsThemeType[]) {
    setThemeTypes(types);
    localStorage.setItem("mtgink_theme_types", JSON.stringify(types));
  }

  async function loadNewTheme() {
    try {
      const typesParam = themeTypesRef.current.length < VS_THEME_TYPES.length
        ? `&theme_types=${themeTypesRef.current.join(",")}`
        : "";
      const res = await fetch(`/api/showdown/compare?mode=vs&random_theme=1${typesParam}`);
      if (res.ok) {
        const data = await res.json();
        const { _theme, ...pair } = data;
        updateSides(pair);
        setFilters(_theme?.filters ?? {});
        setCurrentThemeLabel(_theme?.label ?? undefined);
        filtersRef.current = _theme?.filters ?? {};
        // Update URL to reflect new theme
        const url = new URL("/showdown/vs", window.location.origin);
        if (_theme?.filters?.subtype) {
          url.searchParams.set("subtype", _theme.filters.subtype);
          if (_theme.filters.type) url.searchParams.set("type", _theme.filters.type);
        } else if (_theme?.filters?.set_code) {
          url.searchParams.set("set_code", _theme.filters.set_code);
        } else if (_theme?.artist) {
          url.searchParams.set("artist", _theme.artist);
        } else if (_theme?.tag_id) {
          url.searchParams.set(_theme.type === "art_tag" ? "art_tag" : "tag", _theme.tag_id);
        }
        window.history.replaceState(null, "", url.toString());
      }
    } catch (err) {
      console.error("Failed to load new theme:", err);
    }
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

      // Theme rotation (VS only — skip when page was loaded with explicit filters)
      if (!isRemix && themeRotation !== "manual" && !initialFilters) {
        voteCountRef.current++;
        const threshold = themeRotation === "every" ? 1 : 5;
        if (voteCountRef.current >= threshold) {
          voteCountRef.current = 0;
          await loadNewTheme();
          return;
        }
      }
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
  const voteRef = useRef(vote);
  const skipRef = useRef(skip);
  voteRef.current = vote;
  skipRef.current = skip;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") voteRef.current(0);
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") voteRef.current(1);
      else if (e.key === "s" || e.key === "S") skipRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- Share ---

  function shareUrl(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://mtg.ink";
    return `${origin}/showdown/${mode}?a=${a.set_code}-${a.collector_number}&b=${b.set_code}-${b.collector_number}`;
  }

  // --- Render side ---

  function renderSide(side: ShowdownSide, sideIdx: 0 | 1, onClick?: () => void) {
    const artUrl = cardUrl(side.set_code, side.collector_number, side.image_version);

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-full">
          <CardImage
            key={side.illustration_id}
            src={artUrl}
            alt={`${side.name} by ${side.artist}`}
            onClick={onClick ?? (() => vote(sideIdx))}
            onImageError={skip}
            className="w-full"
          />
          {imageMode !== "card" && (
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
          )}
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              illustrationId={side.illustration_id}
              oracleId={side.oracle_id}
              isFavorited={favorites.has(side.illustration_id)}
              onToggle={toggleFavorite}
            />
          </div>
          {imageMode !== "card" && (
            <div className="absolute bottom-2 right-2 z-10 text-right">
              {!sameCard && (
                <a href={`/card/${side.slug}`} className="text-xs font-bold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] hover:text-amber-200 transition-colors">{side.name}</a>
              )}
              <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{side.artist}</p>
              <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{side.set_code.toUpperCase()}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Build theme link based on active filters
  const themeLink = (() => {
    if (isRemix) return undefined;
    if (filters.subtype) {
      return { label: filters.subtype, href: `/db/tribes/${filters.subtype.toLowerCase()}` };
    }
    if (filters.set_code) {
      return { label: filters.set_code.toUpperCase(), href: `/db/expansions/${filters.set_code}` };
    }
    if (currentThemeLabel && !filters.subtype && !filters.set_code) {
      return { label: currentThemeLabel, href: `/artists/${currentThemeLabel.toLowerCase().replace(/\s+/g, "-")}` };
    }
    return undefined;
  })();

  const sidebarProps = {
    shareUrl: shareUrl(),
    cardLinks: sameCard
      ? [{ name: a.name, slug: a.slug }]
      : [{ name: a.name, slug: a.slug }, { name: b.name, slug: b.slug }],
    themeLink,
    themeRotation: !isRemix ? themeRotation : undefined,
    onThemeRotationChange: !isRemix ? handleThemeRotationChange : undefined,
    onNewTheme: !isRemix ? loadNewTheme : undefined,
    themeTypes: !isRemix ? themeTypes : undefined,
    onThemeTypesChange: !isRemix ? handleThemeTypesChange : undefined,
  };

  return (
    <div className="md:flex md:gap-6 md:max-w-7xl md:mx-auto">
      <div className="flex-1 min-w-0">
        {/* Subnav */}
        <ShowdownSubnav {...sidebarProps}>
          {isRemix ? (
            <>
              Which{" "}
              <a href={`/card/${a.slug}`} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300">
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
          ) : currentThemeLabel ? (
            <>Best <a href={`/artists/${currentThemeLabel.toLowerCase().replace(/\s+/g, "-")}`} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300">{currentThemeLabel}</a> card?</>
          ) : (
            <>Which card is best?</>
          )}
        </ShowdownSubnav>

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
          <VoteGrid
            ref={voteGridRef}
            renderLeft={(onClick) => renderSide(a, 0, onClick)}
            renderRight={(onClick) => renderSide(b, 1, onClick)}
            onVote={vote}
          />
        </div>

        {filterError && (
          <p className="text-center text-sm text-red-400 mt-2">{filterError}</p>
        )}

        <div className="hidden md:flex justify-center items-center gap-6 mt-3 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">&larr;</kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">A</kbd>
            <span>Vote Left</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">S</kbd>
            <span>Skip</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Vote Right</span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">D</kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">&rarr;</kbd>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <ShowdownSidebar {...sidebarProps} />
    </div>
  );
}
