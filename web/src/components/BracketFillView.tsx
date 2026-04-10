"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useImageMode } from "@/lib/image-mode";
import CardImage from "./CardImage";
import CardPreviewOverlay from "./CardPreviewOverlay";
import {
  createBracket,
  recordVote,
  getMatchupCards,
  getChampion,
  getBracketProgress,
  getRoundName,
  isRoundComplete,
  saveBracket,
  loadBracket,
} from "@/lib/bracket-logic";
import type { BracketCard, BracketState, BracketMatchup } from "@/lib/types";

interface BracketFillViewProps {
  cards: BracketCard[];
  slug?: string;
  onComplete?: (state: BracketState) => void;
}

export default function BracketFillView({ cards, slug, onComplete }: BracketFillViewProps) {
  // On mount, try to restore saved progress from localStorage. Only restore if
  // the saved state's cards match the ones we were handed (same illustration_ids,
  // same order) — otherwise the bracket's seeds would point to the wrong cards.
  // Falls back to a fresh bracket.
  const [bracket, setBracket] = useState<BracketState>(() => {
    if (typeof window === "undefined") return createBracket(cards);
    const saved = loadBracket(slug);
    if (saved && saved.cards.length === cards.length) {
      const sameCards = saved.cards.every(
        (c, i) => c.illustration_id === cards[i]?.illustration_id,
      );
      if (sameCards) return saved;
    }
    return createBracket(cards);
  });
  // Jump to the first round that still has unvoted matches. Without this,
  // refreshing a partially-played bracket dumps you back on the already-
  // completed Initial Round instead of where you left off.
  const [activeRound, setActiveRound] = useState<number>(() => {
    for (let r = 0; r < bracket.rounds.length; r++) {
      if (bracket.rounds[r].some((m) => m.winner === null)) return r;
    }
    // Bracket is fully complete — jump to the champion view
    return bracket.rounds.length;
  });
  const roundTabsRef = useRef<HTMLDivElement>(null);
  const matchupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const justVotedRef = useRef(false);

  // cardUrl picks art_crop or normal based on the W-toggle (ImageModeProvider)
  const { cardUrl } = useImageMode();

  const progress = getBracketProgress(bracket);
  const champion = getChampion(bracket);

  // Auto-save on change
  useEffect(() => {
    saveBracket(bracket, slug);
  }, [bracket, slug]);

  // Notify on completion
  useEffect(() => {
    if (bracket.completed && onComplete) {
      onComplete(bracket);
    }
  }, [bracket.completed, onComplete, bracket]);

  const handleVote = useCallback((roundIndex: number, matchupIndex: number, winnerSeed: number) => {
    justVotedRef.current = true;
    setBracket((prev) => {
      const matchup = prev.rounds[roundIndex]?.[matchupIndex];
      if (!matchup) return prev;

      // Already voted for this seed — undo it
      if (matchup.winner === winnerSeed) {
        return undoBracketVote(prev, roundIndex, matchupIndex);
      }

      // Already voted for the other side — undo then re-vote
      if (matchup.winner !== null) {
        const undone = undoBracketVote(prev, roundIndex, matchupIndex);
        return recordVote(undone, roundIndex, matchupIndex, winnerSeed);
      }

      // Fresh vote
      return recordVote(prev, roundIndex, matchupIndex, winnerSeed);
    });

    // Scroll to next unvoted matchup after a short delay
    setTimeout(() => {
      const round = bracket.rounds[roundIndex];
      if (!round) return;
      const nextUnvoted = round.findIndex(
        (m, i) => i > matchupIndex && m.seedA >= 0 && m.seedB >= 0 && m.winner === null
      );
      if (nextUnvoted >= 0) {
        // Try both refs, use the one that's actually visible (offsetParent !== null)
        const desktopEl = matchupRefs.current.get(`desktop-${roundIndex}-${nextUnvoted}`);
        const mobileEl = matchupRefs.current.get(`${roundIndex}-${nextUnvoted}`);
        const el = (desktopEl?.offsetParent ? desktopEl : null)
          || (mobileEl?.offsetParent ? mobileEl : null);
        if (el) {
          if (window.innerWidth >= 768) {
            // Desktop: center matchup in viewport
            const elRect = el.getBoundingClientRect();
            const viewportCenter = window.innerHeight / 2;
            const elCenter = elRect.top + elRect.height / 2;
            window.scrollTo({ top: window.scrollY + (elCenter - viewportCenter), behavior: "smooth" });
          } else {
            // Mobile: scroll to top of matchup with header offset
            const y = el.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top: y, behavior: "smooth" });
          }
        }
      }
    }, 200);
  }, [bracket]);

  // Auto-advance: next round, or champion view when bracket completes
  const championRoundIdx = bracket.rounds.length; // virtual index for champion
  useEffect(() => {
    if (!justVotedRef.current) return;
    justVotedRef.current = false;
    if (bracket.completed) {
      const timer = setTimeout(() => setActiveRound(championRoundIdx), 400);
      return () => clearTimeout(timer);
    }
    const round = bracket.rounds[activeRound];
    if (!round) return;
    const allVoted = round.every((m) => m.winner !== null);
    if (allVoted && activeRound < bracket.rounds.length - 1) {
      const timer = setTimeout(() => setActiveRound(activeRound + 1), 400);
      return () => clearTimeout(timer);
    }
  }, [bracket, activeRound, championRoundIdx]);

  // Pure function: undo a vote and cascade downstream. Uses the explicit
  // matchup.next link for propagation (needed for Initial Round brackets
  // where byes and play-in winners go to non-power-of-2 slots). Falls back
  // to the legacy floor(idx/2) rule for any pre-versioned saved state that
  // somehow slips through.
  function undoBracketVote(state: BracketState, roundIndex: number, matchupIndex: number): BracketState {
    const newRounds = state.rounds.map((round) => round.map((m) => ({ ...m })));
    newRounds[roundIndex][matchupIndex].winner = null;

    const clearDownstream = (rIdx: number, mIdx: number) => {
      const m = newRounds[rIdx][mIdx];
      let targetRound: number;
      let targetMatch: number;
      let isFirst: boolean;
      if (m.next !== undefined) {
        // New-style propagation (matches createBracket's .next links)
        if (m.next === null) return; // final match, nothing downstream
        targetRound = m.next.round;
        targetMatch = m.next.match;
        isFirst = m.next.slot === "A";
      } else {
        // Legacy fallback
        if (rIdx >= newRounds.length - 1) return;
        targetRound = rIdx + 1;
        targetMatch = Math.floor(mIdx / 2);
        isFirst = mIdx % 2 === 0;
      }
      const nextMatchup = newRounds[targetRound]?.[targetMatch];
      if (!nextMatchup) return;
      if (isFirst) nextMatchup.seedA = -1;
      else nextMatchup.seedB = -1;
      if (nextMatchup.winner !== null) {
        nextMatchup.winner = null;
        clearDownstream(targetRound, targetMatch);
      }
    };
    clearDownstream(roundIndex, matchupIndex);

    return { ...state, rounds: newRounds, completed: false };
  }

  // On mobile, scroll past nav on mount so bracket fills the screen
  useEffect(() => {
    if (window.innerWidth < 768) {
      // Delay to ensure layout is complete
      requestAnimationFrame(() => {
        window.scrollTo({ top: 56, behavior: "instant" });
      });
    }
  }, []);

  // Scroll active round tab into view + center the first unvoted matchup on
  // screen. On very large brackets the row overflows horizontally, so we
  // center both axes. Waits two animation frames so the column height /
  // positions are finalized (image aspect-ratios, css transitions) before
  // measuring.
  useEffect(() => {
    const container = roundTabsRef.current;
    if (!container) return;
    const tabIdx = Math.min(activeRound, container.children.length - 1);
    const tab = container.children[tabIdx] as HTMLElement | undefined;
    tab?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

    if (window.innerWidth < 768) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Desktop: wait for the 500ms width/margin CSS transition to finish
    // before measuring + scrolling. Running earlier gives interpolated
    // mid-transition geometry and the scroll lands at the wrong spot.
    // The user sees the layout animate for 500ms (real "movement" feel)
    // and THEN the scroll animates smoothly — one motion, not two.
    //
    // Target the first UNVOTED matchup of the active round (not match 0),
    // so jumping back to a partially-played round lands on where you left
    // off instead of the top.
    const round = bracket.rounds[activeRound];
    let targetIdx = 0;
    if (round) {
      const nextUnvoted = round.findIndex(
        (m) => m.winner === null && m.seedA >= 0 && m.seedB >= 0,
      );
      if (nextUnvoted >= 0) targetIdx = nextUnvoted;
    }
    const timer = setTimeout(() => {
      const el = matchupRefs.current.get(`desktop-${activeRound}-${targetIdx}`);
      if (!el || !el.offsetParent) return;
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 520);
    return () => clearTimeout(timer);
  }, [activeRound]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Sticky header: round tabs + progress bar */}
      <div className="sticky top-0 md:top-14 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div
          ref={roundTabsRef}
          className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide"
        >
          {progress.roundNames.map((name, i) => {
            const rp = progress.roundProgress[i];
            const complete = rp.completed === rp.total;
            const isActive = activeRound === i;
            const hasVotable = bracket.rounds[i].some(
              (m) => m.seedA >= 0 && m.seedB >= 0 && m.winner === null
            );

            return (
              <button
                key={i}
                onClick={() => setActiveRound(i)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-amber-500 text-gray-900"
                    : complete
                      ? "bg-gray-800 text-amber-400"
                      : hasVotable
                        ? "bg-gray-800 text-white"
                        : "bg-gray-900 text-gray-600"
                }`}
              >
                <span>{name}</span>
                {rp.total > 0 && (
                  <span className="ml-1.5 opacity-70">
                    {rp.completed}/{rp.total}
                  </span>
                )}
              </button>
            );
          })}
          {/* Champion tab */}
          <button
            onClick={() => champion && setActiveRound(championRoundIdx)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeRound === championRoundIdx
                ? "bg-amber-500 text-gray-900"
                : champion
                  ? "bg-gray-800 text-amber-400"
                  : "bg-gray-900 text-gray-600"
            }`}
          >
            Champion
          </button>
        </div>
        <div className="px-4 pb-2">
          <div className="flex gap-1 h-1.5">
            {(bracket.rounds[activeRound] ?? []).map((m, i) => (
              <div
                key={i}
                className={`flex-1 rounded-full transition-colors duration-300 ${
                  m.winner !== null ? "bg-amber-500" : "bg-gray-800"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: Round carousel — slides horizontally */}
      <div className="md:hidden overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${activeRound * 100}%)` }}
        >
          {bracket.rounds.map((round, roundIdx) => {
            const pairs: [typeof round[0], typeof round[1] | undefined][] = [];
            for (let i = 0; i < round.length; i += 2) {
              pairs.push([round[i], round[i + 1]]);
            }

            return (
              <div key={roundIdx} className="w-full flex-shrink-0 px-2 pb-20">
                {round.length === 1 ? (
                  <div ref={(el) => { if (el) matchupRefs.current.set(`${roundIdx}-0`, el); }}>
                    <MatchupCard
                      bracket={bracket}
                      matchup={round[0]}
                      roundIndex={roundIdx}
                      matchupIndex={0}
                      matchupNumber={1}
                      totalInRound={1}
                      onVote={handleVote}
                    />
                  </div>
                ) : (
                  pairs.map(([m1, m2], pairIdx) => {
                    const i1 = pairIdx * 2;
                    const i2 = pairIdx * 2 + 1;
                    return (
                      <div key={pairIdx} className="mb-6 rounded-xl bg-gray-900/40 border border-gray-800/50 p-2">
                        <div ref={(el) => { if (el) matchupRefs.current.set(`${roundIdx}-${i1}`, el); }}>
                          <MatchupCard bracket={bracket} matchup={m1} roundIndex={roundIdx} matchupIndex={i1} matchupNumber={i1 + 1} totalInRound={round.length} onVote={handleVote} />
                        </div>
                        {m2 && (
                          <>
                            <div className="flex items-center gap-2 py-1 px-2">
                              <div className="flex-1 border-t border-gray-700" />
                              <span className="text-[9px] text-gray-600 uppercase tracking-wider flex-shrink-0">winners meet</span>
                              <div className="flex-1 border-t border-gray-700" />
                            </div>
                            <div ref={(el) => { if (el) matchupRefs.current.set(`${roundIdx}-${i2}`, el); }}>
                              <MatchupCard bracket={bracket} matchup={m2} roundIndex={roundIdx} matchupIndex={i2} matchupNumber={i2 + 1} totalInRound={round.length} onVote={handleVote} />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
          {/* Champion slide */}
          <div className="w-full flex-shrink-0 px-4">
            {champion ? (
              <div className="text-center pt-4 pb-20">
                <p className="text-sm uppercase tracking-[0.3em] text-amber-400 mb-6">Champion</p>
                <img
                  src={cardUrl(champion.set_code, champion.collector_number, champion.image_version)}
                  alt={champion.name}
                  className="w-full max-w-md rounded-xl border-4 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.3)] mx-auto"
                />
                <h2 className="text-3xl font-bold text-white mt-6">{champion.name}</h2>
                <p className="text-lg text-gray-400 mt-2">{champion.artist} · {champion.set_code.toUpperCase()}</p>
              </div>
            ) : (
              <p className="text-gray-600 text-sm">Complete all rounds to reveal the champion</p>
            )}
          </div>
        </div>
      </div>

      {/* Desktop: All rounds as animated columns.
          Wrappers are flex-shrink-0 so the active round stays its full 55%
          width regardless of how many future rounds also want their share —
          for very large brackets the row overflows horizontally and the
          body becomes horizontally scrollable (can't use overflow-x-auto
          on this container or the vertical overflow for tall columns
          would get clipped too). */}
      <div className="hidden md:flex items-stretch px-4 pb-20">
        {bracket.rounds.map((round, roundIdx) => {
          const isActive = roundIdx === activeRound;
          const isPast = roundIdx < activeRound;
          const isFuture = roundIdx > activeRound;
          const prevRound = roundIdx > 0 ? bracket.rounds[roundIdx - 1] : null;

          return (
            <div key={roundIdx} className="flex items-stretch flex-shrink-0 transition-all duration-500 ease-in-out" style={{
              width: isPast || isActive ? "55%" : "22%",
              marginLeft: isPast ? "-55%" : "0",
              opacity: isPast ? 0 : 1,
              pointerEvents: isPast ? "none" : undefined,
            }}>
              {/* Connector from previous visible round */}
              {!isPast && prevRound && roundIdx > 0 && !isPast && (
                <div className={`flex flex-col justify-around ${isActive ? "flex-shrink-0 w-5" : "flex-1 min-w-5"} transition-opacity duration-500`} style={{ opacity: roundIdx === activeRound ? 0 : 1 }}>
                  {Array.from({ length: Math.ceil(prevRound.length / 2) }).map((_, pIdx) => (
                    <div key={pIdx} className="flex-1 relative">
                      <div className="absolute top-1/4 left-0 right-1/2 border-t-2 border-gray-600" />
                      <div className="absolute bottom-1/4 left-0 right-1/2 border-t-2 border-gray-600" />
                      <div className="absolute top-1/4 bottom-1/4 right-1/2 border-l-2 border-gray-600" />
                      <div className="absolute top-1/2 left-1/2 right-0 border-t-2 border-gray-600" />
                    </div>
                  ))}
                </div>
              )}

              {/* Round column — max-width transitions in sync with the wrapper
                  width so the future→active growth feels like one smooth motion. */}
              <div
                className={`flex flex-col justify-around ${isActive || isPast ? "flex-1 min-w-0" : "flex-shrink-0"}`}
                style={{
                  maxWidth: isFuture ? 280 : 2000,
                  transition: "max-width 500ms ease-in-out",
                }}
              >
                {round.map((matchup, mIdx) => (
                  <div
                    key={mIdx}
                    // flex-shrink-0 is load-bearing here: aspect-ratio children
                    // have min-content height of 0, so without it flexbox
                    // squishes matchups to tiny when there are hundreds stacked
                    // in one column (see 597-card brackets).
                    className={isActive || isPast ? "my-1 flex-shrink-0" : "mx-0.5 my-0.5"}
                    ref={(el) => { if (el) matchupRefs.current.set(`desktop-${roundIdx}-${mIdx}`, el); }}
                  >
                    <MiniMatchupPreview
                      bracket={bracket}
                      matchup={matchup}
                      roundIndex={roundIdx}
                      matchupIndex={mIdx}
                      matchupNumber={mIdx + 1}
                      totalInRound={round.length}
                      onVote={isActive || isPast ? handleVote : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {/* Champion column */}
        <div className="flex items-stretch flex-shrink-0 transition-all duration-500 ease-in-out" style={{
          width: activeRound === championRoundIdx ? "60%" : champion ? "22%" : "0%",
          marginLeft: activeRound > championRoundIdx ? "-60%" : "0",
          opacity: champion || activeRound === championRoundIdx ? 1 : 0,
        }}>
          {/* Connector from final */}
          {champion && (
            <div className="flex flex-col justify-around flex-shrink-0 w-5 transition-opacity duration-500" style={{ opacity: activeRound === championRoundIdx ? 0 : 1 }}>
              <div className="flex-1 relative">
                <div className="absolute top-1/2 left-0 right-0 border-t-2 border-gray-600" />
              </div>
            </div>
          )}
          <div className="flex flex-col justify-around flex-1 min-w-0">
            {champion ? (
              <div className="text-center py-8">
                <p className="text-sm uppercase tracking-[0.3em] text-amber-400 mb-4">Champion</p>
                <img
                  src={cardUrl(champion.set_code, champion.collector_number, champion.image_version)}
                  alt={champion.name}
                  className="w-full max-w-md rounded-xl border-4 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.3)] mx-auto"
                />
                <h2 className="text-2xl font-bold text-white mt-4">{champion.name}</h2>
                <p className="text-sm text-gray-400 mt-1">{champion.artist} · {champion.set_code.toUpperCase()}</p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center">
                  <span className="text-[10px] text-gray-600">TBD</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Full-size Matchup Card ---

function MatchupCard({
  bracket,
  matchup,
  roundIndex,
  matchupIndex,
  matchupNumber,
  totalInRound,
  onVote,
}: {
  bracket: BracketState;
  matchup: BracketMatchup;
  roundIndex: number;
  matchupIndex: number;
  matchupNumber: number;
  totalInRound: number;
  onVote: (round: number, matchup: number, winner: number) => void;
}) {
  const { cardUrl, imageMode } = useImageMode();
  const placeholderAspect = imageMode === "card" ? "aspect-[488/680]" : "aspect-[626/457]";
  const cards = getMatchupCards(bracket, roundIndex, matchupIndex);
  const hasWinner = matchup.winner !== null;

  // Not ready yet — seeds not determined
  if (!cards) {
    return (
      <div className="py-4 opacity-30">
        <p className="text-xs text-gray-600 text-center mb-2">
          Match {matchupNumber} of {totalInRound}
        </p>
        <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-1 md:gap-4">
          <div className={`${placeholderAspect} bg-gray-900 rounded-lg border border-gray-800`} />
          <div className={`${placeholderAspect} bg-gray-900 rounded-lg border border-gray-800`} />
        </div>
      </div>
    );
  }

  const { cardA, cardB, seedA, seedB } = cards;

  function renderSide(card: BracketCard, seed: number) {
    const isWinner = hasWinner && matchup.winner === seed;
    const isLoser = hasWinner && matchup.winner !== seed;
    const artUrl = cardUrl(card.set_code, card.collector_number, card.image_version);

    return (
      <div className={`flex flex-col items-center transition-opacity duration-200 ${isLoser ? "opacity-25" : ""}`}>
        <div className={`relative w-full ${isWinner ? "ring-3 ring-amber-500 rounded-[3.8%]" : ""}`}>
          <CardImage
            key={`${card.illustration_id}-${seed}`}
            src={artUrl}
            alt={`${card.name} by ${card.artist}`}
            onClick={() => onVote(roundIndex, matchupIndex, seed)}
            className="w-full"
          />
          <CardPreviewOverlay
            setCode={card.set_code}
            collectorNumber={card.collector_number}
            imageVersion={card.image_version}
            alt={`${card.name} by ${card.artist}`}
            illustrationId={card.illustration_id}
            oracleId={card.oracle_id}
            cardName={card.name}
            cardSlug={card.slug}
          />
          {isWinner && (
            <div className="absolute top-2 right-2 z-10 pointer-events-none">
              <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
          <div className="absolute bottom-2 right-2 z-10 text-right pointer-events-none">
            <p className={`text-xs font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isWinner ? "text-amber-300" : "text-white"}`}>{card.name}</p>
            <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.artist}</p>
            <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.set_code.toUpperCase()}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1 px-1">
        Match {matchupNumber} of {totalInRound}
      </p>
      <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
        {renderSide(cardA, seedA)}
        {renderSide(cardB, seedB)}
      </div>
    </div>
  );
}

// --- Compact next-round preview ---

function MiniMatchupPreview({
  bracket,
  matchup,
  roundIndex,
  matchupIndex,
  matchupNumber,
  totalInRound,
  onVote,
}: {
  bracket: BracketState;
  matchup: BracketMatchup;
  roundIndex: number;
  matchupIndex: number;
  matchupNumber?: number;
  totalInRound?: number;
  onVote?: (round: number, matchup: number, winner: number) => void;
}) {
  const { cardUrl, imageMode } = useImageMode();
  const placeholderAspect = imageMode === "card" ? "aspect-[488/680]" : "aspect-[626/457]";
  const seedAReady = matchup.seedA >= 0;
  const seedBReady = matchup.seedB >= 0;

  const cardA = seedAReady ? bracket.cards[matchup.seedA] : null;
  const cardB = seedBReady ? bracket.cards[matchup.seedB] : null;
  const hasWinner = matchup.winner !== null;

  function renderSlot(card: BracketCard | null, seed: number) {
    if (!card) {
      return <div className={`${placeholderAspect} bg-gray-800/30 rounded-lg border border-gray-700/30`} />;
    }
    const isWinner = hasWinner && matchup.winner === seed;
    const isLoser = hasWinner && matchup.winner !== seed;

    return (
      <div className={`flex flex-col items-center transition-opacity duration-200 ${isLoser ? "opacity-25" : ""}`}>
        <div className={`relative w-full ${isWinner ? "ring-2 ring-amber-500 rounded-[3.8%]" : ""}`}>
          <CardImage
            key={`${card.illustration_id}-${seed}`}
            src={cardUrl(card.set_code, card.collector_number, card.image_version)}
            alt={`${card.name} by ${card.artist}`}
            onClick={onVote ? () => onVote(roundIndex, matchupIndex, seed) : undefined}
            className="w-full"
          />
          <CardPreviewOverlay
            setCode={card.set_code}
            collectorNumber={card.collector_number}
            imageVersion={card.image_version}
            alt={`${card.name} by ${card.artist}`}
            illustrationId={card.illustration_id}
            oracleId={card.oracle_id}
            cardName={card.name}
            cardSlug={card.slug}
          />
          {isWinner && (
            <div className="absolute top-1 right-1 z-10 pointer-events-none">
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
          <div className="absolute bottom-1 right-1 z-10 text-right pointer-events-none">
            <p className={`text-[10px] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isWinner ? "text-amber-300" : "text-white"}`}>{card.name}</p>
            <p className="text-[9px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.artist}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[180px]">
      {matchupNumber != null && totalInRound != null && (
        <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1 px-0.5">
          Match {matchupNumber} of {totalInRound}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        {renderSlot(cardA, matchup.seedA)}
        {renderSlot(cardB, matchup.seedB)}
      </div>
    </div>
  );
}
