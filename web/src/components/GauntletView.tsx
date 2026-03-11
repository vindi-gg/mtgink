"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import CardImage from "./CardImage";
import CardPreviewOverlay from "./CardPreviewOverlay";
import FavoriteButton from "./FavoriteButton";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";
import { useFavorites } from "@/hooks/useFavorites";
import type { GauntletEntry, CompareFilters } from "@/lib/types";

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

interface GauntletResultEntry {
  oracle_id: string;
  illustration_id: string;
  name: string;
  artist: string;
  set_code: string;
  collector_number: string;
  wins: number;
  position: number;
}

export interface GauntletResult {
  entry: GauntletEntry;
  wins: number;
  position: number;
}

interface GauntletViewProps {
  mode: "remix" | "vs";
  pool: GauntletEntry[];
  cardName?: string;
  filterLabel?: string;
  filters?: CompareFilters;
  dailyChallengeId?: number;
  onComplete?: (champion: GauntletEntry, championWins: number, results: GauntletResult[]) => void;
  hideControls?: boolean;
}

export default function GauntletView({
  mode,
  pool: initialPool,
  cardName,
  filterLabel,
  filters,
  dailyChallengeId,
  onComplete,
  hideControls,
}: GauntletViewProps) {
  const isRemix = mode === "remix";

  const [pool, setPool] = useState(() =>
    [...initialPool].sort(() => Math.random() - 0.5),
  );
  const [championIdx, setChampionIdx] = useState(0);
  const [challengerIdx, setChallengerIdx] = useState(1);
  const [championWins, setChampionWins] = useState(0);
  const [results, setResults] = useState<GauntletResult[]>([]);
  const [phase, setPhase] = useState<"playing" | "complete">(
    initialPool.length < 2 ? "complete" : "playing",
  );
  const [viewMode, setViewMode] = useState<ViewMode>(isRemix ? "art" : "card");
  const [extending, setExtending] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);

  const votingRef = useRef(false);
  const eliminationOrder = useRef(0);

  const champion = pool[championIdx];
  const challenger = pool[challengerIdx];

  const totalMatches = pool.length - 1;
  const currentMatch = results.length + 1;

  const { favorites, toggle: toggleFavorite } = useFavorites(
    phase === "playing" && champion && challenger
      ? [champion.illustration_id, challenger.illustration_id]
      : [],
    isRemix ? "ink" : "clash",
  );

  function saveGauntletResult(champ: GauntletEntry, champWins: number, allResults: GauntletResult[]) {
    const resultEntries: GauntletResultEntry[] = allResults.map((r) => ({
      oracle_id: r.entry.oracle_id,
      illustration_id: r.entry.illustration_id,
      name: r.entry.name,
      artist: r.entry.artist,
      set_code: r.entry.set_code,
      collector_number: r.entry.collector_number,
      wins: r.wins,
      position: r.position,
    }));
    // Add champion as final entry
    resultEntries.push({
      oracle_id: champ.oracle_id,
      illustration_id: champ.illustration_id,
      name: champ.name,
      artist: champ.artist,
      set_code: champ.set_code,
      collector_number: champ.collector_number,
      wins: champWins,
      position: allResults.length + 1,
    });

    fetch("/api/gauntlet/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: getSessionId(),
        mode: isRemix ? "remix" : "vs",
        pool_size: pool.length,
        champion_oracle_id: champ.oracle_id,
        champion_illustration_id: champ.illustration_id,
        champion_name: champ.name,
        champion_wins: champWins,
        results: resultEntries,
        daily_challenge_id: dailyChallengeId ?? null,
        card_name: cardName ?? null,
        filter_label: filterLabel ?? null,
      }),
    }).catch(() => {});
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== "playing") return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") vote(0);
      else if (e.key === "ArrowRight") vote(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mobile, scroll past nav
  useEffect(() => {
    if (window.innerWidth < 768) {
      window.scrollTo({ top: 56, behavior: "instant" });
    }
  }, []);

  function vote(winnerSide: 0 | 1) {
    if (votingRef.current || phase !== "playing") return;
    votingRef.current = true;

    const loser = winnerSide === 0 ? challenger : champion;

    // Update gauntlet state
    eliminationOrder.current++;
    const loserWins = winnerSide === 0 ? 0 : championWins;
    const loserResult: GauntletResult = {
      entry: loser,
      wins: loserWins,
      position: eliminationOrder.current,
    };

    const newResults = [...results, loserResult];
    setResults(newResults);

    const nextChallengerIdx = challengerIdx + 1;

    if (nextChallengerIdx >= pool.length) {
      // Gauntlet complete
      const finalWins = winnerSide === 0 ? championWins + 1 : 1;
      setChampionWins(finalWins);
      const finalChampionIdx = winnerSide === 1 ? challengerIdx : championIdx;
      if (winnerSide === 1) {
        setChampionIdx(challengerIdx);
      }
      setPhase("complete");
      // Save the full gauntlet result
      const finalChamp = pool[finalChampionIdx];
      saveGauntletResult(finalChamp, finalWins, newResults);
      if (onComplete) {
        onComplete(finalChamp, finalWins, newResults);
      }
    } else {
      if (winnerSide === 0) {
        setChampionWins(championWins + 1);
        setChallengerIdx(nextChallengerIdx);
      } else {
        setChampionIdx(challengerIdx);
        setChampionWins(1);
        setChallengerIdx(nextChallengerIdx);
      }
    }

    // Brief lock to prevent accidental double-clicks
    setTimeout(() => {
      votingRef.current = false;
    }, 150);
  }

  async function extendGauntlet(count: number) {
    if (extending) return;
    setExtending(true);

    try {
      const excludeIds = pool.map((e) => e.oracle_id).join(",");
      const params = new URLSearchParams();
      params.set("count", String(count));
      params.set("exclude", excludeIds);
      if (filters?.colors?.length) params.set("colors", filters.colors.join(","));
      if (filters?.type) params.set("type", filters.type);
      if (filters?.subtype) params.set("subtype", filters.subtype);
      if (filters?.set_code) params.set("set_code", filters.set_code);

      const res = await fetch(`/api/showdown/gauntlet?${params}`);
      if (!res.ok) throw new Error("Failed to fetch more cards");
      const newEntries: GauntletEntry[] = await res.json();

      if (newEntries.length === 0) return;

      const newPool = [...pool, ...newEntries];
      setPool(newPool);
      setChallengerIdx(pool.length); // First new entry
      setPhase("playing");
    } catch (err) {
      console.error("Extend failed:", err);
    } finally {
      setExtending(false);
    }
  }

  function restart() {
    const shuffled = [...initialPool].sort(() => Math.random() - 0.5);
    setPool(shuffled);
    setChampionIdx(0);
    setChallengerIdx(1);
    setChampionWins(0);
    setResults([]);
    eliminationOrder.current = 0;
    setPhase(initialPool.length < 2 ? "complete" : "playing");
  }

  const showArt = viewMode === "art";

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showNewGame) return;
    const close = () => setShowNewGame(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showNewGame]);

  function renderNewGameDropdown() {
    return (
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowNewGame(!showNewGame); }}
          className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 transition-colors inline-flex items-center gap-1"
        >
          New Game
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showNewGame && (
          <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl z-40 min-w-[140px]">
            <a
              href="/showdown/gauntlet?mode=card"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 hover:text-amber-400 transition-colors"
            >
              Random Card
            </a>
            <a
              href="/showdown/gauntlet"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 hover:text-amber-400 transition-colors"
            >
              Random
            </a>
            <a
              href="/showdown/gauntlet?mode=group"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 hover:text-amber-400 transition-colors"
            >
              Random Group
            </a>
          </div>
        )}
      </div>
    );
  }

  function renderViewToggle() {
    return (
      <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
        <button
          onClick={() => setViewMode("art")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === "art"
              ? "bg-amber-500 text-gray-900"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          Art
        </button>
        <button
          onClick={() => setViewMode("card")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === "card"
              ? "bg-amber-500 text-gray-900"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          Card
        </button>
      </div>
    );
  }

  function renderModeLinks() {
    return (
      <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
        <Link
          href="/showdown/remix"
          className="px-4 py-1.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          Remix
        </Link>
        <Link
          href="/showdown/vs"
          className="px-4 py-1.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          VS
        </Link>
        <span className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-gray-900">
          Gauntlet
        </span>
      </div>
    );
  }

  function renderEntry(entry: GauntletEntry, side: 0 | 1, label: string, wins?: number) {
    const artUrl = artCropUrl(entry.set_code, entry.collector_number, entry.image_version);
    const cardUrl = normalCardUrl(entry.set_code, entry.collector_number, entry.image_version);
    const imgSrc = showArt ? artUrl : cardUrl;

    return (
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-bold uppercase ${label === "Champion" ? "text-amber-500" : "text-gray-500"}`}>
            {label}
          </span>
          {wins !== undefined && wins > 0 && (
            <span className="text-xs text-amber-400/70">
              {wins} win{wins !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {(!isRemix) && (
          <a
            href={`/card/${entry.slug}`}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 mb-1 transition-colors truncate max-w-full"
          >
            {entry.name}
          </a>
        )}
        <div className="relative w-full">
          <CardImage
            key={`${entry.illustration_id}-${viewMode}`}
            src={imgSrc}
            alt={`${entry.name} by ${entry.artist}`}
            onClick={() => vote(side)}
            className="w-full"
          />
          {showArt && (
            <CardPreviewOverlay setCode={entry.set_code} collectorNumber={entry.collector_number} imageVersion={entry.image_version} alt={`${entry.name} by ${entry.artist}`} />
          )}
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              illustrationId={entry.illustration_id}
              oracleId={entry.oracle_id}
              isFavorited={favorites.has(entry.illustration_id)}
              onToggle={toggleFavorite}
            />
          </div>
        </div>
        {showArt && (
          <div className="mt-2 text-center">
            <p className="text-sm font-medium text-gray-200">{entry.artist}</p>
            <p className="text-xs text-gray-400">
              {entry.set_name} ({entry.set_code.toUpperCase()})
            </p>
          </div>
        )}
      </div>
    );
  }

  const title = cardName
    ? `${cardName} Gauntlet`
    : filterLabel
      ? `${filterLabel} Gauntlet`
      : "Gauntlet";

  // "Another one" button — same type, different random pick
  const repeatUrl = cardName
    ? "/showdown/gauntlet?mode=card"
    : filterLabel
      ? "/showdown/gauntlet?mode=group"
      : "/showdown/gauntlet";
  const repeatLabel = cardName
    ? "New Card"
    : filterLabel
      ? "New Group"
      : "New Random";

  // --- Playing phase ---

  if (phase === "playing" && champion && challenger) {
    return (
      <div>
        <h2 className="font-bold text-center mb-1 md:mb-2 text-base md:text-lg">
          <span className="text-amber-400">{title}</span>
        </h2>

        {/* Progress */}
        <div className="text-center mb-3">
          <div className="inline-flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Match {currentMatch} of {totalMatches}
            </span>
            <div className="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${(currentMatch / totalMatches) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="relative max-w-4xl mx-auto">
          <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
            {renderEntry(champion, 0, "Champion", championWins)}
            {renderEntry(challenger, 1, "Challenger")}
          </div>
        </div>

        {/* Controls */}
        {!hideControls && (
          <div className="flex justify-center gap-3 mt-4">
            {renderModeLinks()}
            {renderNewGameDropdown()}
            {renderViewToggle()}
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-3">
          Click or arrow keys to vote
        </p>
      </div>
    );
  }

  // --- Complete phase ---

  const finalChampion = pool[championIdx];
  const sortedResults = [...results].sort((a, b) => b.position - a.position);

  return (
    <div>
      <h2 className="font-bold text-center mb-1 text-base md:text-lg">
        <span className="text-amber-400">{title}</span>
        <span className="text-gray-400"> — Complete!</span>
      </h2>

      {/* Champion display */}
      {finalChampion && (
        <div className="max-w-xs mx-auto mb-6 mt-4">
          <div className="text-center mb-2">
            <span className="text-xs font-bold text-amber-500 uppercase">Champion</span>
            <span className="text-xs text-gray-500 ml-2">
              {championWins} win{championWins !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="relative ring-2 ring-amber-500/50 rounded-[5%] overflow-hidden">
            <img
              src={
                showArt
                  ? artCropUrl(finalChampion.set_code, finalChampion.collector_number, finalChampion.image_version)
                  : normalCardUrl(finalChampion.set_code, finalChampion.collector_number, finalChampion.image_version)
              }
              alt={finalChampion.name}
              className="w-full"
            />
          </div>
          <div className="text-center mt-2">
            <a
              href={`/card/${finalChampion.slug}`}
              className="text-sm font-bold text-amber-400 hover:text-amber-300"
            >
              {finalChampion.name}
            </a>
            <p className="text-xs text-gray-400">
              {finalChampion.artist} &middot; {finalChampion.set_name}
            </p>
          </div>
        </div>
      )}

      {/* Results list */}
      {sortedResults.length > 0 && (
        <div className="max-w-md mx-auto mb-6">
          <h3 className="text-xs font-bold text-gray-500 mb-2 text-center uppercase">
            Results
          </h3>
          <div className="space-y-1">
            {sortedResults.map((r, i) => (
              <div
                key={`${r.entry.illustration_id}-${r.position}`}
                className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-3 py-2"
              >
                <span className="text-xs text-gray-600 w-5 text-right font-mono">
                  #{i + 2}
                </span>
                <img
                  src={artCropUrl(r.entry.set_code, r.entry.collector_number, r.entry.image_version)}
                  alt={r.entry.name}
                  className="w-10 h-10 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <a
                    href={`/card/${r.entry.slug}`}
                    className="text-sm text-gray-200 hover:text-amber-400 truncate block"
                  >
                    {isRemix ? r.entry.artist : r.entry.name}
                  </a>
                  <span className="text-xs text-gray-500">
                    {isRemix ? r.entry.set_name : r.entry.artist}
                    {r.wins > 0 && ` \u00b7 ${r.wins} win${r.wins !== 1 ? "s" : ""}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3">
        <a
          href={repeatUrl}
          className="px-5 py-2 text-sm font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
        >
          {repeatLabel}
        </a>
        <button
          onClick={restart}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
        >
          Replay
        </button>
        {!isRemix && (
          <>
            <button
              onClick={() => extendGauntlet(10)}
              disabled={extending}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-50"
            >
              {extending ? "Loading..." : "+10 More"}
            </button>
          </>
        )}
        {renderNewGameDropdown()}
      </div>

      {/* Mode + view toggles */}
      <div className="flex justify-center gap-3 mt-4">
        {renderModeLinks()}
        {renderViewToggle()}
      </div>
    </div>
  );
}
