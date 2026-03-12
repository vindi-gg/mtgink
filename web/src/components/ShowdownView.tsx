"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CardImage from "./CardImage";
import FavoriteButton from "./FavoriteButton";
import PriceTag from "./PriceTag";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";
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

type ViewMode = "art" | "card";

function getInitialViewMode(defaultMode: ViewMode): ViewMode {
  if (typeof window === "undefined") return defaultMode;
  const saved = localStorage.getItem("mtgink_view_mode");
  if (saved === "art" || saved === "card") return saved;
  return defaultMode;
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

// --- Constants ---

const COLOR_LABELS: { code: string; label: string; bg: string; text: string }[] = [
  { code: "W", label: "W", bg: "bg-amber-50", text: "text-gray-900" },
  { code: "U", label: "U", bg: "bg-blue-500", text: "text-white" },
  { code: "B", label: "B", bg: "bg-gray-800", text: "text-gray-200" },
  { code: "R", label: "R", bg: "bg-red-600", text: "text-white" },
  { code: "G", label: "G", bg: "bg-green-600", text: "text-white" },
  { code: "C", label: "C", bg: "bg-gray-500", text: "text-white" },
];

const CARD_TYPES = [
  "Creature", "Instant", "Sorcery", "Enchantment", "Artifact", "Planeswalker", "Land",
];

const POPULAR_SUBTYPES = [
  "Angel", "Dragon", "Goblin", "Elf", "Zombie",
  "Vampire", "Demon", "Merfolk", "Human", "Wizard",
  "Knight", "Sliver", "Dinosaur", "Cat", "Phyrexian",
];

interface Preset {
  label: string;
  filters: CompareFilters;
}

const PRESETS: Preset[] = [
  { label: "Angels", filters: { type: "Creature", subtype: "Angel" } },
  { label: "Dragons", filters: { type: "Creature", subtype: "Dragon" } },
  { label: "Goblins", filters: { type: "Creature", subtype: "Goblin" } },
  { label: "Elves", filters: { type: "Creature", subtype: "Elf" } },
  { label: "Zombies", filters: { type: "Creature", subtype: "Zombie" } },
  { label: "Vampires", filters: { type: "Creature", subtype: "Vampire" } },
  { label: "Slivers", filters: { type: "Creature", subtype: "Sliver" } },
  { label: "Artifacts", filters: { type: "Artifact" } },
  { label: "Planeswalkers", filters: { type: "Planeswalker" } },
  { label: "Lands", filters: { type: "Land" } },
];

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

function filtersEqual(a: CompareFilters, b: CompareFilters): boolean {
  const colorsA = (a.colors ?? []).sort().join(",");
  const colorsB = (b.colors ?? []).sort().join(",");
  return colorsA === colorsB && (a.type ?? "") === (b.type ?? "") && (a.subtype ?? "") === (b.subtype ?? "");
}

// --- Component ---

interface ShowdownViewProps {
  mode: "remix" | "vs";
  initialPair: ComparisonPair | ClashPair;
  initialFilters?: CompareFilters;
}

export default function ShowdownView({ mode, initialPair, initialFilters }: ShowdownViewProps) {
  const router = useRouter();
  const baseUrl = `/showdown/${mode}`;
  const isRemix = mode === "remix";
  const defaultView: ViewMode = "art";

  const [sides, setSides] = useState(() => normalizePair(initialPair, mode));
  const [voting, setVoting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => getInitialViewMode(defaultView));
  const [filters, setFilters] = useState<CompareFilters>(initialFilters ?? {});
  const [showFilters, setShowFilters] = useState(hasActiveFilters(initialFilters ?? {}));
  const [filterError, setFilterError] = useState<string | null>(null);
  const [showingCard, setShowingCard] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
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
    setShowingCard(null);
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

  function changeViewMode(m: ViewMode) {
    setViewMode(m);
    localStorage.setItem("mtgink_view_mode", m);
  }

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

  // --- Filters ---

  const applyFilters = useCallback(async (newFilters: CompareFilters) => {
    setFilters(newFilters);
    filtersRef.current = newFilters;
    setFilterError(null);

    const params = filtersToParams(newFilters);
    const newUrl = params ? `${baseUrl}?${params}` : baseUrl;
    router.replace(newUrl, { scroll: false });

    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    try {
      const res = await fetch(compareUrl(newFilters));
      const data = await res.json();
      if (data.error) {
        setFilterError(data.error);
        votingRef.current = false;
        setVoting(false);
        return;
      }
      updateSides(data);
    } catch {
      setFilterError("Failed to load cards with these filters");
    } finally {
      votingRef.current = false;
      setVoting(false);
    }
  }, [router, baseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleColor(code: string) {
    const current = filters.colors ?? [];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    applyFilters({ ...filters, colors: next.length > 0 ? next : undefined });
  }

  function setType(type: string) {
    applyFilters({ ...filters, type: type || undefined });
  }

  function setSubtype(subtype: string) {
    applyFilters({ ...filters, subtype: subtype || undefined });
  }

  function applyPreset(preset: Preset) {
    if (hasActiveFilters(filters) && filtersEqual(filters, preset.filters)) {
      applyFilters({});
    } else {
      applyFilters(preset.filters);
    }
  }

  function clearFilters() {
    applyFilters({});
  }

  // --- Share ---

  function shareUrl(): string {
    return `${window.location.origin}/showdown/${mode}?a=${a.set_code}-${a.collector_number}&b=${b.set_code}-${b.collector_number}`;
  }

  // --- Render side ---

  const active = hasActiveFilters(filters);
  const showArt = viewMode === "art";

  function renderSide(side: ShowdownSide, sideIdx: 0 | 1) {
    const artUrl = artCropUrl(side.set_code, side.collector_number, side.image_version);
    const cardUrl = normalCardUrl(side.set_code, side.collector_number, side.image_version);
    const handleClick = () => vote(sideIdx);
    const imgSrc = showArt ? artUrl : cardUrl;

    return (
      <div className="flex flex-col items-center">
        {/* Card name — always show for VS, show for remix only if different cards */}
        {(!sameCard || !isRemix) && (
          <a
            href={`/card/${side.slug}`}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 mb-1 transition-colors truncate max-w-full"
          >
            {side.name}
          </a>
        )}
        <div className="relative w-full">
          <CardImage
            key={`${side.illustration_id}-${viewMode}`}
            src={imgSrc}
            alt={`${side.name} by ${side.artist}`}
            onClick={handleClick}
            onImageError={skip}
            className="w-full"
          />
          {/* Card preview button — only in art mode */}
          {showArt && (
            <button
              type="button"
              className="absolute bottom-2 left-2 z-30 w-8 h-10 rounded bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-zoom-in hover:bg-black/60 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setShowingCard(side.illustration_id);
              }}
              onPointerEnter={(e) => {
                if (window.innerWidth >= 768) {
                  setShowingCard(side.illustration_id);
                  setCursorPos({ x: e.clientX, y: e.clientY });
                }
              }}
              onPointerMove={(e) => {
                if (window.innerWidth >= 768) setCursorPos({ x: e.clientX, y: e.clientY });
              }}
              onPointerLeave={() => {
                if (window.innerWidth >= 768) { setShowingCard(null); setCursorPos(null); }
              }}
            >
              <svg width="16" height="20" viewBox="0 0 16 20" fill="none" className="text-white/70">
                <rect x="1" y="1" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="3.5" y="3.5" width="9" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
                <line x1="3.5" y1="12" x2="12.5" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <line x1="3.5" y1="14.5" x2="10" y2="14.5" stroke="currentColor" strokeWidth="1" opacity="0.3" />
              </svg>
            </button>
          )}
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              illustrationId={side.illustration_id}
              oracleId={side.oracle_id}
              isFavorited={favorites.has(side.illustration_id)}
              onToggle={toggleFavorite}
            />
          </div>
        </div>
        {/* Metadata below art — only in art mode */}
        {showArt && (
          <div className="mt-2 text-center">
            <p className="text-sm font-medium text-gray-200">{side.artist}</p>
            <p className="text-xs text-gray-400">
              {side.set_name} ({side.set_code.toUpperCase()})
            </p>
            {!isRemix && (
              <div className="mt-1">
                <PriceTag oracleId={side.oracle_id} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Mode toggle links — preserve current filters
  const filterStr = filtersToParams(filters);
  const remixUrl = filterStr ? `/showdown/remix?${filterStr}` : "/showdown/remix";
  const vsUrl = filterStr ? `/showdown/vs?${filterStr}` : "/showdown/vs";
  const gauntletUrl = filterStr ? `/showdown/gauntlet?${filterStr}` : "/showdown/gauntlet";

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

      {/* Mode + display toggles */}
      <div className="flex justify-center gap-3 mt-4">
        <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
          <Link
            href={remixUrl}
            className={`px-4 py-1.5 text-xs font-bold transition-colors ${
              isRemix ? "bg-amber-500 text-gray-900" : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Remix
          </Link>
          <Link
            href={vsUrl}
            className={`px-4 py-1.5 text-xs font-bold transition-colors ${
              !isRemix ? "bg-amber-500 text-gray-900" : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            VS
          </Link>
          <Link
            href={gauntletUrl}
            className="px-4 py-1.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Gauntlet
          </Link>
        </div>

        <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
          <button
            onClick={() => changeViewMode("art")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "art"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Art
          </button>
          <button
            onClick={() => changeViewMode("card")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "card"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Card
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-4xl mx-auto mt-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
              active
                ? "border-amber-500 text-amber-400"
                : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
            }`}
          >
            Filter{active ? " (active)" : ""}
          </button>

          <div className="flex flex-wrap gap-1">
            {PRESETS.slice(0, 7).map((preset) => {
              const isActive = hasActiveFilters(filters) && filtersEqual(filters, preset.filters);
              return (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    isActive
                      ? "bg-amber-500 text-black font-bold"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {active && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-14 flex-shrink-0">Colors</span>
              <div className="flex gap-1">
                {COLOR_LABELS.map((c) => {
                  const isOn = (filters.colors ?? []).includes(c.code);
                  return (
                    <button
                      key={c.code}
                      onClick={() => toggleColor(c.code)}
                      className={`w-7 h-7 rounded text-xs font-bold transition-all ${
                        isOn
                          ? `${c.bg} ${c.text} ring-2 ring-amber-400`
                          : `${c.bg} ${c.text} opacity-30 hover:opacity-60`
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-14 flex-shrink-0">Type</span>
              <select
                value={filters.type ?? ""}
                onChange={(e) => setType(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">Any type</option>
                {CARD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-14 flex-shrink-0">Subtype</span>
              <input
                type="text"
                value={filters.subtype ?? ""}
                onChange={(e) => setSubtype(e.target.value)}
                placeholder="e.g. Angel, Goblin, Wizard..."
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 w-48"
                list="showdown-subtype-suggestions"
              />
              <datalist id="showdown-subtype-suggestions">
                {POPULAR_SUBTYPES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-800">
              {PRESETS.map((preset) => {
                const isActive = hasActiveFilters(filters) && filtersEqual(filters, preset.filters);
                return (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(preset)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      isActive
                        ? "bg-amber-500 text-black font-bold"
                        : "text-gray-600 hover:text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filterError && (
          <p className="text-center text-sm text-red-400 mt-2">{filterError}</p>
        )}
      </div>

      <p className="text-center text-xs text-gray-600 mt-3">
        Arrow keys to vote, S to skip
      </p>

      {/* Mobile card preview modal */}
      {showingCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-fade-in md:hidden"
          onClick={() => setShowingCard(null)}
        >
          <img
            src={normalCardUrl(
              (showingCard === a.illustration_id ? a : b).set_code,
              (showingCard === a.illustration_id ? a : b).collector_number,
              (showingCard === a.illustration_id ? a : b).image_version,
            )}
            alt="Card preview"
            className="max-h-[85vh] max-w-full rounded-[3.8%]"
          />
        </div>
      )}

      {/* Desktop card preview — follows cursor */}
      {showingCard && cursorPos && (
        <div
          className="fixed z-50 pointer-events-none hidden md:block"
          style={{
            left: cursorPos.x + 20,
            top: Math.min(cursorPos.y - 200, window.innerHeight - 520),
            width: 336,
          }}
        >
          <img
            src={normalCardUrl(
              (showingCard === a.illustration_id ? a : b).set_code,
              (showingCard === a.illustration_id ? a : b).collector_number,
              (showingCard === a.illustration_id ? a : b).image_version,
            )}
            alt="Card preview"
            className="w-full rounded-[3.8%] shadow-2xl shadow-black/80"
          />
        </div>
      )}
    </div>
  );
}
