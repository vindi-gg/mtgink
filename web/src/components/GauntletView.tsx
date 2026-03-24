"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import CardImage from "./CardImage";
import CardPreviewOverlay from "./CardPreviewOverlay";
import FavoriteButton from "./FavoriteButton";
import RecentActivity from "./RecentActivity";
import { artCropUrl } from "@/lib/image-utils";
import { useImageMode } from "@/lib/image-mode";
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

interface GauntletMatchup {
  mode: "remix" | "vs";
  // Remix mode (same card, different art)
  oracle_id?: string;
  winner_illustration_id?: string;
  loser_illustration_id?: string;
  // VS mode (different cards)
  winner_oracle_id?: string;
  loser_oracle_id?: string;
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
  themeName?: string;
  fixedOrder?: boolean;
  brewId?: string;
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
  themeName,
  fixedOrder,
  brewId,
}: GauntletViewProps) {
  const { imageMode, cardUrl } = useImageMode();
  const isRemix = mode === "remix";

  const [pool, setPool] = useState(() =>
    fixedOrder ? [...initialPool] : [...initialPool].sort(() => Math.random() - 0.5),
  );
  const [championIdx, setChampionIdx] = useState(0);
  const [challengerIdx, setChallengerIdx] = useState(1);
  const [championWins, setChampionWins] = useState(0);
  const [results, setResults] = useState<GauntletResult[]>([]);
  const [phase, setPhase] = useState<"playing" | "complete">(
    initialPool.length < 2 ? "complete" : "playing",
  );
  const [extending, setExtending] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [resultId, setResultId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const votingRef = useRef(false);
  const eliminationOrder = useRef(0);
  const matchups = useRef<GauntletMatchup[]>([]);

  // Undo history — snapshot state before each vote
  interface UndoSnapshot {
    championIdx: number;
    challengerIdx: number;
    championWins: number;
    results: GauntletResult[];
    eliminationOrder: number;
  }
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);

  // --- localStorage persistence ---
  const storageKey = dailyChallengeId
    ? `mtgink_gauntlet_daily_${dailyChallengeId}`
    : null; // Only persist daily gauntlets (regular ones get fresh pools)

  interface SavedGauntletState {
    pool: GauntletEntry[];
    championIdx: number;
    challengerIdx: number;
    championWins: number;
    results: GauntletResult[];
    eliminationOrder: number;
    matchups: GauntletMatchup[];
    undoStack: UndoSnapshot[];
    phase: "playing" | "complete";
  }

  // Restore from localStorage on mount
  const [didRestore, setDidRestore] = useState(false);
  useEffect(() => {
    if (!storageKey || didRestore) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) { setDidRestore(true); return; }
      const saved: SavedGauntletState = JSON.parse(raw);
      if (saved.phase === "complete") {
        // Already completed — clear saved state
        localStorage.removeItem(storageKey);
        setDidRestore(true);
        return;
      }
      setPool(saved.pool);
      setChampionIdx(saved.championIdx);
      setChallengerIdx(saved.challengerIdx);
      setChampionWins(saved.championWins);
      setResults(saved.results);
      eliminationOrder.current = saved.eliminationOrder;
      matchups.current = saved.matchups;
      setUndoStack(saved.undoStack);
      setPhase(saved.phase);
    } catch {
      localStorage.removeItem(storageKey);
    }
    setDidRestore(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save to localStorage after each state change
  useEffect(() => {
    if (!storageKey || !didRestore) return;
    if (phase === "complete") {
      localStorage.removeItem(storageKey);
      return;
    }
    const state: SavedGauntletState = {
      pool,
      championIdx,
      challengerIdx,
      championWins,
      results,
      eliminationOrder: eliminationOrder.current,
      matchups: matchups.current,
      undoStack,
      phase,
    };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [storageKey, didRestore, pool, championIdx, challengerIdx, championWins, results, undoStack, phase]);

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

  async function saveGauntletResult(champ: GauntletEntry, champWins: number, allResults: GauntletResult[]): Promise<void> {
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

    try {
      const r = await fetch("/api/gauntlet/complete", {
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
          matchups: matchups.current,
          daily_challenge_id: dailyChallengeId ?? null,
          card_name: cardName ?? null,
          filter_label: filterLabel ?? null,
          brew_id: brewId ?? null,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data?.id) setResultId(data.id);
      }
    } catch {
      // Don't block completion on save failure
    }
  }

  // Keyboard shortcuts — use refs to avoid stale closures
  const voteRef = useRef(vote);
  const undoRef = useRef(undo);
  const resetRef = useRef(resetGauntlet);
  voteRef.current = vote;
  undoRef.current = undo;
  resetRef.current = resetGauntlet;

  useEffect(() => {
    if (phase !== "playing") return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") voteRef.current(0);
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") voteRef.current(1);
      else if ((e.key === "z" || e.key === "Z") && !e.metaKey && !e.ctrlKey) undoRef.current();
      else if (e.key === "Escape") resetRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase]);

  // On mobile, scroll past nav
  useEffect(() => {
    if (window.innerWidth < 768) {
      window.scrollTo({ top: 56, behavior: "instant" });
    }
  }, []);

  function undo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setChampionIdx(prev.championIdx);
    setChallengerIdx(prev.challengerIdx);
    setChampionWins(prev.championWins);
    setResults(prev.results);
    eliminationOrder.current = prev.eliminationOrder;
    matchups.current.pop();
    setUndoStack(undoStack.slice(0, -1));
    setPhase("playing");
  }

  function vote(winnerSide: 0 | 1) {
    if (votingRef.current || phase !== "playing") return;
    votingRef.current = true;

    // Save snapshot for undo
    setUndoStack((prev) => [...prev, {
      championIdx,
      challengerIdx,
      championWins,
      results,
      eliminationOrder: eliminationOrder.current,
    }]);

    const winner = winnerSide === 0 ? champion : challenger;
    const loser = winnerSide === 0 ? challenger : champion;

    // Record matchup for ELO processing at completion
    if (isRemix) {
      matchups.current.push({
        mode: "remix",
        oracle_id: winner.oracle_id,
        winner_illustration_id: winner.illustration_id,
        loser_illustration_id: loser.illustration_id,
      });
    } else {
      matchups.current.push({
        mode: "vs",
        winner_oracle_id: winner.oracle_id,
        loser_oracle_id: loser.oracle_id,
      });
    }

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
      // Save the full gauntlet result, then notify parent
      const finalChamp = pool[finalChampionIdx];
      saveGauntletResult(finalChamp, finalWins, newResults).then(() => {
        if (onComplete) {
          onComplete(finalChamp, finalWins, newResults);
        }
      });
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

  function resetGauntlet() {
    if (!confirm("Reset this gauntlet? All progress will be lost.")) return;
    const newPool = fixedOrder ? [...initialPool] : [...initialPool].sort(() => Math.random() - 0.5);
    setPool(newPool);
    setChampionIdx(0);
    setChallengerIdx(1);
    setChampionWins(0);
    setResults([]);
    setUndoStack([]);
    eliminationOrder.current = 0;
    matchups.current = [];
    if (storageKey) localStorage.removeItem(storageKey);
    setPhase(initialPool.length < 2 ? "complete" : "playing");
  }


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
              href="/showdown/gauntlet"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 hover:text-amber-400 transition-colors"
            >
              Random
            </a>
            <a
              href="/showdown/gauntlet?mode=card"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 hover:text-amber-400 transition-colors"
            >
              Remix
            </a>
            <a
              href="/showdown/gauntlet?mode=group"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 hover:text-amber-400 transition-colors"
            >
              Theme
            </a>
            <a
              href="/browse/tags"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 hover:text-amber-400 transition-colors"
            >
              Tag
            </a>
          </div>
        )}
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
    const imgSrc = cardUrl(entry.set_code, entry.collector_number, entry.image_version);

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-full">
          <CardImage
            key={entry.illustration_id}
            src={imgSrc}
            alt={`${entry.name} by ${entry.artist}`}
            onClick={() => vote(side)}
            className="w-full"
          />
          {imageMode !== "card" && (
            <CardPreviewOverlay
              setCode={entry.set_code}
              collectorNumber={entry.collector_number}
              imageVersion={entry.image_version}
              alt={`${entry.name} by ${entry.artist}`}
              illustrationId={entry.illustration_id}
              oracleId={entry.oracle_id}
              cardName={entry.name}
              cardSlug={entry.slug}
              isFavorited={favorites.has(entry.illustration_id)}
              onToggleFavorite={toggleFavorite}
            />
          )}
          {/* Champion/Challenger label — top left */}
          <div className="absolute top-1.5 left-1.5 z-10">
            <span className={`text-[10px] font-bold uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${label === "Champion" ? "text-amber-400" : "text-gray-400"}`}>
              {label}
              {wins !== undefined && wins > 0 && (
                <span className="text-amber-400/70 ml-1 font-medium">
                  {wins}W
                </span>
              )}
            </span>
          </div>
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              illustrationId={entry.illustration_id}
              oracleId={entry.oracle_id}
              isFavorited={favorites.has(entry.illustration_id)}
              onToggle={toggleFavorite}
            />
          </div>
          {imageMode !== "card" && (
            <div className="absolute bottom-2 right-2 z-10 text-right">
              {!isRemix && (
                <a href={`/card/${entry.slug}`} className="text-xs font-bold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] hover:text-amber-200 transition-colors">{entry.name}</a>
              )}
              <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{entry.artist}</p>
              <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{entry.set_code.toUpperCase()}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const title = themeName
    ? themeName
    : cardName
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

  function renderProgressTicks() {
    return (
      <div className="flex gap-[2px]">
        {Array.from({ length: totalMatches }, (_, i) => (
          <div
            key={i}
            className={`h-[3px] flex-1 rounded-[1px] transition-colors duration-200 ${
              i < currentMatch - 1
                ? "bg-amber-500"
                : i === currentMatch - 1
                  ? "bg-amber-500/60"
                  : "bg-gray-800"
            }`}
          />
        ))}
      </div>
    );
  }

  if (phase === "playing" && champion && challenger) {
    return (
      <div>
        {/* Thin title bar with title + counter */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold text-amber-400 truncate">{title}</span>
          <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
            {currentMatch + 1}/{pool.length}
          </span>
        </div>

        {/* Segmented progress ticks */}
        <div className="mb-2">
          {renderProgressTicks()}
        </div>

        {/* Main grid */}
        <div className="relative max-w-4xl mx-auto">
          <div className={`grid ${imageMode === "card" ? "grid-cols-2" : "grid-cols-1 landscape:grid-cols-2"} md:grid-cols-2 gap-2 md:gap-6`}>
            {renderEntry(champion, 0, "Champion", championWins)}
            {renderEntry(challenger, 1, "Challenger")}
          </div>
        </div>


        {/* Keyboard hints */}
        <div className="hidden md:flex justify-center items-center gap-6 mt-3 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">&larr;</kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">A</kbd>
            <span>Vote Left</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">Z</kbd>
            <span>Undo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">Esc</kbd>
            <span>Reset</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Vote Right</span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">D</kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">&rarr;</kbd>
          </div>
        </div>

        {/* Controls */}
        {!hideControls && (
          <div className="flex justify-center gap-3 mt-4">
            {renderModeLinks()}
            {renderNewGameDropdown()}
          </div>
        )}
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
              src={cardUrl(finalChampion.set_code, finalChampion.collector_number, finalChampion.image_version)}
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

      {/* New gauntlet above results */}
      {!dailyChallengeId && (
        <div className="flex justify-center mb-6">
          {renderNewGameDropdown()}
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
                  src={cardUrl(r.entry.set_code, r.entry.collector_number, r.entry.image_version)}
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
          onClick={() => {
            const newPool = fixedOrder ? [...initialPool] : [...initialPool].sort(() => Math.random() - 0.5);
            setPool(newPool);
            setChampionIdx(0);
            setChallengerIdx(1);
            setChampionWins(0);
            setResults([]);
            setUndoStack([]);
            eliminationOrder.current = 0;
            matchups.current = [];
            setPhase(initialPool.length < 2 ? "complete" : "playing");
          }}
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
        {resultId && (
          <button
            onClick={async () => {
              const url = `${window.location.origin}/gauntlet/result/${resultId}`;
              try { await navigator.clipboard.writeText(url); } catch {
                const input = document.createElement("input");
                input.value = url;
                document.body.appendChild(input);
                input.select();
                document.execCommand("copy");
                document.body.removeChild(input);
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            {copied ? "Link copied!" : "Share"}
          </button>
        )}
      </div>

      {/* Mode + view toggles */}
      <div className="flex justify-center gap-3 mt-4">
        {renderModeLinks()}
      </div>

      {!hideControls && <RecentActivity />}
    </div>
  );
}
