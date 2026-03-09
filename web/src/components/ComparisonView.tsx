"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CardImage from "./CardImage";
import FavoriteButton from "./FavoriteButton";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";
import { useFavorites } from "@/hooks/useFavorites";
import type { ComparisonPair, CompareFilters, VoteResponse } from "@/lib/types";

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
  if (typeof window === "undefined") return "art";
  return (localStorage.getItem("mtgink_view_mode") as ViewMode) || "art";
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
  "Creature",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Planeswalker",
  "Land",
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
  // Parse {W}{U}{2} etc
  const symbols = manaCost.match(/\{([^}]+)\}/g) || [];
  return (
    <span className="inline-flex gap-0.5">
      {symbols.map((sym, i) => {
        const code = sym.replace(/[{}]/g, "");
        const color = MANA_COLORS[code];
        return (
          <span
            key={i}
            className={`text-xs font-bold ${color ?? "text-gray-300"}`}
          >
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
  // mode is not included — it's implicit in the route (/ink vs /clash)
  return params.toString();
}

function apiParams(filters: CompareFilters): string {
  const params = new URLSearchParams();
  if (filters.colors?.length) params.set("colors", filters.colors.join(","));
  if (filters.type) params.set("type", filters.type);
  if (filters.subtype) params.set("subtype", filters.subtype);
  if (filters.mode === "cross") params.set("mode", "cross");
  return params.toString();
}

function hasActiveFilters(filters: CompareFilters): boolean {
  return !!(
    (filters.colors && filters.colors.length > 0) ||
    filters.type ||
    filters.subtype
  );
}

function filtersEqual(a: CompareFilters, b: CompareFilters): boolean {
  const colorsA = (a.colors ?? []).sort().join(",");
  const colorsB = (b.colors ?? []).sort().join(",");
  return colorsA === colorsB && (a.type ?? "") === (b.type ?? "") && (a.subtype ?? "") === (b.subtype ?? "");
}

interface ComparisonViewProps {
  initialPair: ComparisonPair;
  initialFilters?: CompareFilters;
  baseUrl?: string;
  initialSubMode?: "mirror" | "vs";
}

export default function ComparisonView({ initialPair, initialFilters, baseUrl = "/ink", initialSubMode = "mirror" }: ComparisonViewProps) {
  const router = useRouter();
  const [pair, setPair] = useState<ComparisonPair>(initialPair);
  const [voting, setVoting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [filters, setFilters] = useState<CompareFilters>(initialFilters ?? {});
  const [showFilters, setShowFilters] = useState(hasActiveFilters(initialFilters ?? {}));
  const [filterError, setFilterError] = useState<string | null>(null);
  const [subMode, setSubMode] = useState<"mirror" | "vs">(initialSubMode);
  const pairRef = useRef(pair);
  const votingRef = useRef(false);
  const filtersRef = useRef(filters);
  const { favorites, toggle: toggleFavorite } = useFavorites([
    pair.a.illustration_id,
    pair.b.illustration_id,
  ]);

  filtersRef.current = filters;

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("mtgink_view_mode", mode);
  }

  pairRef.current = pair;

  // When filters change, fetch a new pair
  const applyFilters = useCallback(async (newFilters: CompareFilters) => {
    setFilters(newFilters);
    filtersRef.current = newFilters;
    setFilterError(null);

    // Update URL without full navigation
    const params = filtersToParams(newFilters);
    const newUrl = params ? `${baseUrl}?${params}` : baseUrl;
    router.replace(newUrl, { scroll: false });

    // Fetch new pair with filters
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    try {
      const aq = apiParams(newFilters);
      const res = await fetch(`/api/compare${aq ? `?${aq}` : ""}`);
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
  }, [router, baseUrl]);

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
          filters: hasActiveFilters(filtersRef.current) ? filtersRef.current : undefined,
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
      const aq = apiParams(filtersRef.current);
      const res = await fetch(`/api/compare${aq ? `?${aq}` : ""}`);
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
      // Don't capture keys when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
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

  function toggleColor(code: string) {
    const current = filters.colors ?? [];
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
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

  async function switchSubMode(mode: "mirror" | "vs") {
    if (mode === subMode) return;
    setSubMode(mode);

    // Build new filters with mode change
    const newFilters: CompareFilters = {
      ...filtersRef.current,
      mode: mode === "vs" ? "cross" : "same",
    };

    // Update URL
    const params = filtersToParams(newFilters);
    const modeParam = mode === "vs" ? "mode=vs" : "";
    const allParams = [modeParam, params].filter(Boolean).join("&");
    router.replace(allParams ? `${baseUrl}?${allParams}` : baseUrl, { scroll: false });

    // Fetch new pair
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    try {
      const aq = apiParams(newFilters);
      const res = await fetch(`/api/compare${aq ? `?${aq}` : ""}`);
      const data = await res.json();
      if (!data.error) {
        setPair(data);
        pairRef.current = data;
        setFilters(newFilters);
        filtersRef.current = newFilters;
      }
    } catch {
      // Silently handle
    } finally {
      votingRef.current = false;
      setVoting(false);
    }
  }

  const aArt = artCropUrl(pair.a.set_code, pair.a.collector_number);
  const bArt = artCropUrl(pair.b.set_code, pair.b.collector_number);
  const aCard = normalCardUrl(pair.a.set_code, pair.a.collector_number);
  const bCard = normalCardUrl(pair.b.set_code, pair.b.collector_number);

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: "art", label: "Art" },
    { value: "card", label: "Card" },
    { value: "both", label: "Both" },
  ];

  const active = hasActiveFilters(filters);

  const isCross = !!pair.card_b || subMode === "vs";
  const isInk = baseUrl === "/ink";

  function renderSide(
    side: typeof pair.a,
    otherSide: typeof pair.b,
    artUrl: string,
    cardUrl: string,
    sideCard: typeof pair.card
  ) {
    const handleClick = () =>
      vote(side.illustration_id, otherSide.illustration_id);

    // Ink mode: always art crop + card metadata. Clash mode: uses viewMode toggle.
    const showArt = isInk || viewMode === "art" || viewMode === "both";
    const showCard = !isInk && (viewMode === "card" || viewMode === "both");
    const showBothSpacer = !isInk && viewMode === "both";

    // Short type line: just the part after the dash, or the full thing if no dash
    const typeParts = sideCard.type_line?.split("\u2014") ?? [];
    const shortType = typeParts.length > 1 ? typeParts[0].trim() : sideCard.type_line;

    return (
      <div className="flex flex-col items-center">
        {isCross && (
          <a
            href={`/card/${sideCard.slug}`}
            className="text-sm font-bold text-amber-400 hover:text-amber-300 mb-2 transition-colors"
          >
            {sideCard.name}
          </a>
        )}
        <div className="relative w-full">
          {showArt && (
            <CardImage
              key={`${side.illustration_id}-art`}
              src={artUrl}
              alt={`${sideCard.name} art by ${side.artist}`}
              onClick={handleClick}
              className="w-full"
            />
          )}
          {showBothSpacer && <div className="h-3" />}
          {showCard && (
            <CardImage
              key={`${side.illustration_id}-card`}
              src={cardUrl}
              alt={`${sideCard.name} by ${side.artist}`}
              onClick={handleClick}
              className="w-full"
            />
          )}
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              illustrationId={side.illustration_id}
              oracleId={sideCard.oracle_id}
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
          {isInk && (
            <div className="mt-1 flex items-center justify-center gap-2 text-xs text-gray-500">
              {shortType && <span>{shortType}</span>}
              {sideCard.mana_cost && (
                <>
                  <span className="text-gray-700">&middot;</span>
                  {renderManaCost(sideCard.mana_cost)}
                </>
              )}
              {sideCard.cmc != null && (
                <>
                  <span className="text-gray-700">&middot;</span>
                  <span>MV {sideCard.cmc}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-center mb-4">
        {subMode === "vs" || isCross ? (
          <>Which art do you prefer?</>
        ) : (
          <>
            Which <span className="text-amber-400">{pair.card.name}</span> art do
            you prefer?
          </>
        )}
      </h2>

      {/* Sub-mode toggle */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
          <button
            onClick={() => switchSubMode("mirror")}
            className={`px-5 py-2 text-sm font-bold transition-colors ${
              subMode === "mirror"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Mirror
          </button>
          <button
            onClick={() => switchSubMode("vs")}
            className={`px-5 py-2 text-sm font-bold transition-colors ${
              subMode === "vs"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            VS
          </button>
          <Link
            href="/ink/gauntlet"
            className="px-5 py-2 text-sm font-bold text-gray-600 hover:text-gray-400 transition-colors"
          >
            Gauntlet
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="max-w-4xl mx-auto mb-4">
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

          {/* Quick presets */}
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
            {/* Colors */}
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

            {/* Type */}
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

            {/* Subtype */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-14 flex-shrink-0">Subtype</span>
              <input
                type="text"
                value={filters.subtype ?? ""}
                onChange={(e) => setSubtype(e.target.value)}
                placeholder="e.g. Angel, Goblin, Wizard..."
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 w-48"
                list="subtype-suggestions"
              />
              <datalist id="subtype-suggestions">
                {POPULAR_SUBTYPES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            {/* More presets */}
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

      {!isInk && (
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
      )}

      {voting && (
        <p className="text-center text-amber-400 text-sm mb-4">Loading next...</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {renderSide(pair.a, pair.b, aArt, aCard, pair.card)}
        {renderSide(pair.b, pair.a, bArt, bCard, pair.card_b ?? pair.card)}
      </div>

      <div className="flex justify-center gap-4 mt-6">
        <button
          onClick={skip}
          disabled={voting}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors disabled:opacity-50"
        >
          Skip (S)
        </button>
        {!isCross && (
          <a
            href={`/card/${pair.card.slug}`}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
          >
            See all arts
          </a>
        )}
      </div>

      <p className="text-center text-xs text-gray-600 mt-4">
        Use arrow keys to vote, S to skip
      </p>
    </div>
  );
}
