"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import CardImage from "./CardImage";
import BracketDiagram from "./BracketDiagram";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";
import {
  createBracket,
  recordBracketVote,
  getCurrentMatchupCards,
  getChampion,
  getBracketProgress,
  saveBracket,
  loadBracket,
  clearBracket,
} from "@/lib/bracket-logic";
import type { BracketCard, BracketState } from "@/lib/types";

type ViewMode = "art" | "card" | "both";

function getInitialViewMode(): ViewMode {
  if (typeof window === "undefined") return "art";
  return (localStorage.getItem("mtgink_view_mode") as ViewMode) || "art";
}

interface BracketViewProps {
  initialCards: BracketCard[];
}

export default function BracketView({ initialCards }: BracketViewProps) {
  const [bracket, setBracket] = useState<BracketState | null>(null);
  const [resumePrompt, setResumePrompt] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [loading, setLoading] = useState(false);
  const bracketRef = useRef<BracketState | null>(null);
  const votingRef = useRef(false);

  // On mount, check localStorage for in-progress bracket
  useEffect(() => {
    const saved = loadBracket();
    if (saved && !saved.completed) {
      setResumePrompt(true);
    } else {
      // Start fresh
      const fresh = createBracket(initialCards);
      setBracket(fresh);
      bracketRef.current = fresh;
      saveBracket(fresh);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleResume() {
    const saved = loadBracket()!;
    setBracket(saved);
    bracketRef.current = saved;
    setResumePrompt(false);
  }

  function handleStartFresh() {
    clearBracket();
    const fresh = createBracket(initialCards);
    setBracket(fresh);
    bracketRef.current = fresh;
    saveBracket(fresh);
    setResumePrompt(false);
  }

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("mtgink_view_mode", mode);
  }

  const vote = useCallback((winnerSeed: number) => {
    if (votingRef.current) return;
    const current = bracketRef.current;
    if (!current || current.completed) return;

    votingRef.current = true;
    const newState = recordBracketVote(current, winnerSeed);
    setBracket(newState);
    bracketRef.current = newState;
    saveBracket(newState);
    votingRef.current = false;
  }, []);

  // Keyboard support
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const current = bracketRef.current;
      if (!current || current.completed) return;
      const matchup = current.rounds[current.currentRound][current.currentMatchup];
      if (matchup.seedA < 0 || matchup.seedB < 0) return;

      if (e.key === "ArrowLeft") {
        vote(matchup.seedA);
      } else if (e.key === "ArrowRight") {
        vote(matchup.seedB);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [vote]);

  async function handleNewBracket() {
    setLoading(true);
    try {
      const res = await fetch("/api/bracket");
      const data = await res.json();
      clearBracket();
      const fresh = createBracket(data.cards);
      setBracket(fresh);
      bracketRef.current = fresh;
      saveBracket(fresh);
    } catch (err) {
      console.error("Failed to fetch new bracket:", err);
    } finally {
      setLoading(false);
    }
  }

  // Resume prompt
  if (resumePrompt) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h2 className="text-2xl font-bold text-white">Bracket In Progress</h2>
        <p className="text-gray-400">You have an unfinished bracket. Resume or start fresh?</p>
        <div className="flex gap-4">
          <button
            onClick={handleResume}
            className="px-6 py-3 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors"
          >
            Resume
          </button>
          <button
            onClick={handleStartFresh}
            className="px-6 py-3 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-500 hover:text-white transition-colors"
          >
            Start Fresh
          </button>
        </div>
      </div>
    );
  }

  if (!bracket) return null;

  const matchupCards = getCurrentMatchupCards(bracket);
  const champion = getChampion(bracket);
  const progress = getBracketProgress(bracket);

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: "art", label: "Art" },
    { value: "card", label: "Card" },
    { value: "both", label: "Both" },
  ];

  // Completed state
  if (bracket.completed && champion) {
    const champArt = artCropUrl(champion.set_code, champion.collector_number);

    return (
      <div>
        <div className="flex flex-col items-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-2">Champion</h2>
          <div className="max-w-sm w-full">
            <CardImage
              src={champArt}
              alt={`${champion.name} by ${champion.artist}`}
              className="w-full ring-4 ring-amber-400"
            />
          </div>
          <h3 className="text-2xl font-bold text-amber-400 mt-4">{champion.name}</h3>
          <p className="text-gray-400 text-sm">{champion.artist}</p>
          <p className="text-gray-500 text-xs mt-1">
            {champion.set_name} ({champion.set_code.toUpperCase()})
          </p>
          <button
            onClick={handleNewBracket}
            disabled={loading}
            className="mt-6 px-6 py-3 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "New Bracket"}
          </button>
        </div>

        <BracketDiagram bracket={bracket} />
      </div>
    );
  }

  // Voting state
  if (!matchupCards) return null;

  const { cardA, cardB } = matchupCards;
  const matchup = bracket.rounds[bracket.currentRound][bracket.currentMatchup];
  const aArt = artCropUrl(cardA.set_code, cardA.collector_number);
  const bArt = artCropUrl(cardB.set_code, cardB.collector_number);
  const aCard = normalCardUrl(cardA.set_code, cardA.collector_number);
  const bCard = normalCardUrl(cardB.set_code, cardB.collector_number);
  const progressPct = (progress.completedMatchups / progress.totalMatchups) * 100;

  function renderSide(
    card: BracketCard,
    seed: number,
    artUrl: string,
    cardUrl: string
  ) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-full">
          {(viewMode === "art" || viewMode === "both") && (
            <CardImage
              key={`${card.illustration_id}-art`}
              src={artUrl}
              alt={`${card.name} art by ${card.artist}`}
              onClick={() => vote(seed)}
              className="w-full"
            />
          )}
          {viewMode === "both" && <div className="h-3" />}
          {(viewMode === "card" || viewMode === "both") && (
            <CardImage
              key={`${card.illustration_id}-card`}
              src={cardUrl}
              alt={`${card.name} by ${card.artist}`}
              onClick={() => vote(seed)}
              className="w-full"
            />
          )}
        </div>
        <div className="mt-3 text-center">
          <p className="text-sm font-bold text-white">{card.name}</p>
          <p className="text-xs text-gray-400">{card.artist}</p>
          <p className="text-xs text-gray-500">
            {card.set_name} ({card.set_code.toUpperCase()})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-amber-400">{progress.roundName}</span>
          <span className="text-sm text-gray-400">
            Match {progress.matchupInRound} of {progress.matchupsInRound}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-right">
          {progress.completedMatchups} / {progress.totalMatchups} matchups
        </p>
      </div>

      {/* Heading */}
      <h2 className="text-2xl font-bold text-center mb-4">
        Which card has <span className="text-amber-400">better art</span>?
      </h2>

      {/* View mode toggle */}
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

      {/* Two cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {renderSide(cardA, matchup.seedA, aArt, aCard)}
        {renderSide(cardB, matchup.seedB, bArt, bCard)}
      </div>

      <p className="text-center text-xs text-gray-600 mt-6">
        Use arrow keys to vote
      </p>

      {/* Bracket diagram */}
      <div className="mt-10">
        <BracketDiagram bracket={bracket} />
      </div>
    </div>
  );
}
