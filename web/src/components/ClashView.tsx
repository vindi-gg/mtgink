"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CardImage from "./CardImage";
import FavoriteButton from "./FavoriteButton";
import PriceTag from "./PriceTag";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";
import { useFavorites } from "@/hooks/useFavorites";
import type { ClashPair, ClashCard, CardRating, CompareFilters, CardVoteResponse } from "@/lib/types";

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

type ViewMode = "art" | "card" | "both";

function getInitialViewMode(): ViewMode {
  if (typeof window === "undefined") return "card";
  return (localStorage.getItem("mtgink_view_mode") as ViewMode) || "card";
}

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

const MANA_COLORS: Record<string, string> = {
  W: "text-amber-200",
  U: "text-blue-400",
  B: "text-purple-400",
  R: "text-red-400",
  G: "text-green-400",
};

function renderManaCost(manaCost: string | null) {
  if (!manaCost) return null;
  const symbols = manaCost.match(/\{([^}]+)\}/g) || [];
  return (
    <span className="inline-flex gap-0.5">
      {symbols.map((sym, i) => {
        const code = sym.replace(/[{}]/g, "");
        const color = MANA_COLORS[code];
        return (
          <span key={i} className={`text-xs font-bold ${color ?? "text-gray-300"}`}>
            {code}
          </span>
        );
      })}
    </span>
  );
}

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

function filtersToParams(filters: CompareFilters): string {
  const params = new URLSearchParams();
  if (filters.colors?.length) params.set("colors", filters.colors.join(","));
  if (filters.type) params.set("type", filters.type);
  if (filters.subtype) params.set("subtype", filters.subtype);
  return params.toString();
}

function hasActiveFilters(filters: CompareFilters): boolean {
  return !!((filters.colors && filters.colors.length > 0) || filters.type || filters.subtype);
}

function filtersEqual(a: CompareFilters, b: CompareFilters): boolean {
  const colorsA = (a.colors ?? []).sort().join(",");
  const colorsB = (b.colors ?? []).sort().join(",");
  return colorsA === colorsB && (a.type ?? "") === (b.type ?? "") && (a.subtype ?? "") === (b.subtype ?? "");
}

interface ClashViewProps {
  initialPair: ClashPair;
  initialFilters?: CompareFilters;
}

export default function ClashView({ initialPair, initialFilters }: ClashViewProps) {
  const router = useRouter();
  const [pair, setPair] = useState<ClashPair>(initialPair);
  const [voting, setVoting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [filters, setFilters] = useState<CompareFilters>(initialFilters ?? {});
  const [showFilters, setShowFilters] = useState(hasActiveFilters(initialFilters ?? {}));
  const [filterError, setFilterError] = useState<string | null>(null);
  const pairRef = useRef(pair);
  const votingRef = useRef(false);
  const filtersRef = useRef(filters);

  const { favorites, toggle: toggleFavorite } = useFavorites([
    pair.a.illustration_id,
    pair.b.illustration_id,
  ], "clash");

  filtersRef.current = filters;
  pairRef.current = pair;

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("mtgink_view_mode", mode);
  }

  const applyFilters = useCallback(async (newFilters: CompareFilters) => {
    setFilters(newFilters);
    filtersRef.current = newFilters;
    setFilterError(null);

    const params = filtersToParams(newFilters);
    const newUrl = params ? `/clash?${params}` : "/clash";
    router.replace(newUrl, { scroll: false });

    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    try {
      const aq = filtersToParams(newFilters);
      const res = await fetch(`/api/clash/compare${aq ? `?${aq}` : ""}`);
      const data = await res.json();
      if (data.error) {
        setFilterError(data.error);
        votingRef.current = false;
        setVoting(false);
        return;
      }
      setPair(data);
      pairRef.current = data;
    } catch {
      setFilterError("Failed to load cards with these filters");
    } finally {
      votingRef.current = false;
      setVoting(false);
    }
  }, [router]);

  async function vote(winnerOracleId: string, loserOracleId: string) {
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    try {
      const res = await fetch("/api/clash/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          winner_oracle_id: winnerOracleId,
          loser_oracle_id: loserOracleId,
          session_id: getSessionId(),
          filters: hasActiveFilters(filtersRef.current) ? filtersRef.current : undefined,
        }),
      });

      if (!res.ok) {
        console.error("Vote failed:", res.status, await res.text());
        return;
      }

      const data: CardVoteResponse = await res.json();
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
      const aq = filtersToParams(filtersRef.current);
      const res = await fetch(`/api/clash/compare${aq ? `?${aq}` : ""}`);
      const data: ClashPair = await res.json();
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const p = pairRef.current;
      if (e.key === "ArrowLeft") {
        vote(p.a.oracle_id, p.b.oracle_id);
      } else if (e.key === "ArrowRight") {
        vote(p.b.oracle_id, p.a.oracle_id);
      } else if (e.key === "s" || e.key === "S") {
        skip();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: "art", label: "Art" },
    { value: "card", label: "Card" },
    { value: "both", label: "Both" },
  ];

  const active = hasActiveFilters(filters);

  function renderSide(card: ClashCard, otherCard: ClashCard, _rating: CardRating | null) {
    const handleClick = () => vote(card.oracle_id, otherCard.oracle_id);
    const artUrl = artCropUrl(card.set_code, card.collector_number, card.image_version);
    const cardUrl = normalCardUrl(card.set_code, card.collector_number, card.image_version);
    const showArt = viewMode === "art" || viewMode === "both";
    const showCard = viewMode === "card" || viewMode === "both";
    const showBothSpacer = viewMode === "both";

    return (
      <div className="flex flex-col items-center">
        <a
          href={`/card/${card.slug}`}
          className="text-xs font-bold text-amber-400 hover:text-amber-300 mb-1 transition-colors truncate max-w-full"
        >
          {card.name}
        </a>
        <div className="relative w-full">
          {showArt && (
            <CardImage
              key={`${card.oracle_id}-art`}
              src={artUrl}
              alt={`${card.name} art by ${card.artist}`}
              onClick={handleClick}
              onImageError={skip}
              className="w-full"
            />
          )}
          {showBothSpacer && <div className="h-3" />}
          {showCard && (
            <CardImage
              key={`${card.oracle_id}-card`}
              src={cardUrl}
              alt={`${card.name} by ${card.artist}`}
              onClick={handleClick}
              onImageError={skip}
              className="w-full"
            />
          )}
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              illustrationId={card.illustration_id}
              oracleId={card.oracle_id}
              isFavorited={favorites.has(card.illustration_id)}
              onToggle={toggleFavorite}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Compact heading */}
      <h2 className="text-lg font-bold text-center mb-3">
        Which card wins?
      </h2>

      <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-4 md:gap-6 max-w-4xl mx-auto">
        {renderSide(pair.a, pair.b, pair.a_rating)}
        {renderSide(pair.b, pair.a, pair.b_rating)}
      </div>

      {voting && (
        <p className="text-center text-amber-400 text-sm mt-3">Loading next...</p>
      )}

      {/* Controls below cards */}
      <div className="flex justify-center gap-3 mt-4">
        <button
          onClick={skip}
          disabled={voting}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors disabled:opacity-50"
        >
          Skip (S)
        </button>
      </div>

      {/* Sub-mode + view mode toggles */}
      <div className="flex justify-center gap-3 mt-4">
        <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
          <span className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-gray-900">
            VS
          </span>
          <Link
            href="/clash/gauntlet"
            className="px-4 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-400 transition-colors"
          >
            Gauntlet
          </Link>
        </div>

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
                list="clash-subtype-suggestions"
              />
              <datalist id="clash-subtype-suggestions">
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
    </div>
  );
}
