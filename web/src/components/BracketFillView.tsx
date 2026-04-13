"use client";

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useImageMode } from "@/lib/image-mode";
import { useNavFocus } from "@/lib/nav-focus";
import { createClient } from "@/lib/supabase/client";
import { saveCompletedBracketLocal, clearBracketHistoryLocal } from "@/lib/bracket-history";
import CardImage from "./CardImage";
import CardPreviewOverlay from "./CardPreviewOverlay";
import StackedCardLayout from "./StackedCardLayout";
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
  bracketName?: string;
  /** Brew slug (without the "brew-" prefix) when this bracket is backed
   *  by a brew — used to build share URLs and "link to card" fallbacks. */
  brewSlug?: string | null;
  /** Seed ID when this bracket was created via the creation modal.
   *  Used to build shareable play links: /bracket?seed={seedId} */
  seedId?: string | null;
  /** Completion ID after the bracket is saved — used for shareable
   *  results link: /bracket/results/{completionId} */
  completionId?: string | null;
  onComplete?: (state: BracketState) => void;
  onRestart?: () => void;
  /** When true, skip the built-in save-to-history logic (both the
   *  /api/bracket/save POST for logged-in users and the localStorage
   *  save for anon). Used by daily brackets where the caller handles
   *  its own save with different metadata. */
  disableAutoSave?: boolean;
  /** Extra content rendered below the champion card when the bracket is
   *  complete. Replaces the default championFooter (share/link buttons).
   *  Used by daily brackets to show the "come back tomorrow" countdown. */
  championExtra?: React.ReactNode;
}

export default function BracketFillView({ cards, slug, bracketName, brewSlug, seedId, completionId, onComplete, onRestart, disableAutoSave = false, championExtra }: BracketFillViewProps) {
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
  const rootRef = useRef<HTMLDivElement>(null);
  const roundTabsRef = useRef<HTMLDivElement>(null);
  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const matchupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const justVotedRef = useRef(false);
  const lastRoundChangeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const mobileSettingsRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const savedToHistoryRef = useRef(false);

  // Supabase auth — determines whether to show the "My Brackets" link
  // and whether to prompt the user to sign in on the champion screen.
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const isLoggedIn = !!user;

  // Close the mobile settings dropdown on outside click.
  useEffect(() => {
    if (!mobileSettingsOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        mobileSettingsRef.current &&
        !mobileSettingsRef.current.contains(e.target as Node)
      ) {
        setMobileSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [mobileSettingsOpen]);

  // cardUrl picks art_crop or normal based on the W-toggle (ImageModeProvider)
  const { cardUrl, imageMode, toggleImageMode } = useImageMode();

  // Focus mode — hide the global navbar by default on /bracket, restore
  // on unmount. The hamburger button in the sticky header below toggles
  // it back visible without leaving the page.
  const { hidden: navHidden, setHidden: setNavHidden } = useNavFocus();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, [setNavHidden]);

  const progress = getBracketProgress(bracket);
  const champion = getChampion(bracket);
  const championRoundIdx = bracket.rounds.length; // virtual index for champion

  // Step to prev/next round with a cooldown so a single trackpad fling or
  // swipe gesture doesn't fly through every round in one go. 500ms matches
  // the CSS transition duration on the round wrappers.
  const ROUND_CHANGE_COOLDOWN = 500;
  const navigateRound = useCallback(
    (delta: number) => {
      const now = Date.now();
      if (now - lastRoundChangeRef.current < ROUND_CHANGE_COOLDOWN) return;
      const maxIdx = champion ? championRoundIdx : bracket.rounds.length - 1;
      const next = Math.max(0, Math.min(maxIdx, activeRound + delta));
      if (next !== activeRound) {
        lastRoundChangeRef.current = now;
        setActiveRound(next);
      }
    },
    [activeRound, bracket.rounds.length, champion, championRoundIdx],
  );

  // Share the bracket via the Web Share API when available, falling back
  // to clipboard copy. Two variants: "finished" phrases the share text
  // around the result (champion reveal), "play" phrases it as an
  // invitation to play the bracket fresh. Both variants share the same
  // URL (current /bracket route with the brew param preserved).
  const [copied, setCopied] = useState<string | null>(null);

  const copyPlayLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = seedId
      ? `${window.location.origin}/bracket?seed=${seedId}`
      : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("play");
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  }, [seedId]);

  const copyResultsLink = useCallback(async () => {
    if (typeof window === "undefined" || !completionId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/bracket/results/${completionId}`);
      setCopied("results");
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  }, [completionId]);

  // Hijack horizontal wheel/trackpad scroll: trackpad two-finger horizontal
  // (or shift+wheel) changes rounds instead of horizontally scrolling the
  // page. Listener is attached to the bracket root (not window) so other
  // pages aren't affected, and passive: false is required so we can
  // preventDefault and suppress the browser's native horizontal scroll.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 10) {
        e.preventDefault();
        navigateRound(e.deltaX > 0 ? 1 : -1);
      }
    };
    root.addEventListener("wheel", handler, { passive: false });
    return () => root.removeEventListener("wheel", handler);
  }, [navigateRound]);

  // Touch swipe handlers — only evaluated on touchend so we don't block
  // native vertical scrolling during a drag. Horizontal must dominate (>1.5×
  // vertical delta) and exceed 50px for a swipe to count.
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      navigateRound(dx < 0 ? 1 : -1);
    }
  };

  // Auto-save on change
  useEffect(() => {
    saveBracket(bracket, slug);
  }, [bracket, slug]);

  // Notify on completion + save to "My Brackets" history. Logged-in
  // users persist to the saved_brackets table via /api/bracket/save;
  // anon users save to localStorage on the device. The savedToHistoryRef
  // guard keeps this from firing twice in Strict Mode or on re-renders
  // while bracket.completed stays true. The ref resets when the bracket
  // goes back to incomplete (e.g. after a restart).
  useEffect(() => {
    if (!bracket.completed) {
      savedToHistoryRef.current = false;
      return;
    }
    // Use sessionStorage to persist the guard across re-mounts (e.g. returning
    // from auth). The ref alone resets on mount, causing duplicate saves.
    const historyKey = `bracket_history_saved_${slug}`;
    const alreadySaved = typeof window !== "undefined" && sessionStorage.getItem(historyKey);
    if (!savedToHistoryRef.current && !disableAutoSave && !alreadySaved) {
      savedToHistoryRef.current = true;
      if (typeof window !== "undefined") sessionStorage.setItem(historyKey, "1");
      const champ = getChampion(bracket);
      if (champ) {
        const championSummary = {
          oracle_id: champ.oracle_id,
          illustration_id: champ.illustration_id,
          name: champ.name,
          artist: champ.artist,
          set_code: champ.set_code,
          collector_number: champ.collector_number,
          image_version: champ.image_version,
          slug: champ.slug,
        };
        if (isLoggedIn) {
          // Persist server-side. Fire-and-forget; failure is non-fatal
          // (the bracket is still celebrated in the UI). If the save
          // fails we drop the ref guard so a later event can retry.
          fetch("/api/bracket/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brew_slug: brewSlug ?? null,
              brew_name: bracketName ?? null,
              card_count: bracket.cards.length,
              champion: championSummary,
            }),
          }).then((res) => {
            if (res.ok) {
              // Clear localStorage so the /my/brackets migration doesn't
              // create a duplicate from the same entry.
              clearBracketHistoryLocal();
            } else {
              savedToHistoryRef.current = false;
            }
          }).catch(() => {
            savedToHistoryRef.current = false;
          });
        } else {
          // Anon: localStorage only.
          saveCompletedBracketLocal({
            brewSlug: brewSlug ?? null,
            brewName: bracketName ?? null,
            champion: championSummary,
            cardCount: bracket.cards.length,
          });
        }
      }
    }
    if (onComplete) onComplete(bracket);
  }, [bracket.completed, onComplete, bracket, brewSlug, bracketName, isLoggedIn]);

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

  // Scroll the active round tab into the sticky header.
  useEffect(() => {
    const container = roundTabsRef.current;
    if (!container) return;
    const tabIdx = Math.min(activeRound, container.children.length - 1);
    const tab = container.children[tabIdx] as HTMLElement | undefined;
    tab?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeRound]);

  // Center the first unvoted matchup of the active round, in parallel with
  // the round wrapper's width/marginLeft CSS transition.
  //
  //  - useLayoutEffect runs synchronously after React commits new inline
  //    styles (width: 55%, marginLeft: 0, etc.) but BEFORE the browser's
  //    first paint, so both animations kick off in the same frame.
  //  - We measure the BRACKET CONTAINER (not the specific matchup) because
  //    items-stretch makes the container height = tallest round column.
  //    justify-around distributes matchups evenly through that height.
  //  - document.documentElement.offsetHeight is the most aggressive layout
  //    flush we can trigger — Firefox in particular sometimes doesn't
  //    propagate style changes from a deeply-nested flex child when you
  //    only read offsetHeight on that child.
  //  - We ONLY scroll vertically. The bracket row is wider than the
  //    viewport on many screens (flex-shrink-0 children), which makes the
  //    document itself horizontally scrollable. Any scrollTo({left})
  //    would horizontally scroll the WHOLE page — including sticky-top
  //    navbar, since sticky only resists scroll on the axis it has an
  //    offset for. Vertical-only keeps the nav glued in place.
  //  - After the 500ms CSS transition completes, we run a correction
  //    scroll. Chrome/Safari land the first scroll perfectly and the
  //    correction is a no-op. Firefox's smooth-scroll animation stalls
  //    when the document layout is mutating underneath it, so the
  //    correction re-measures settled geometry and nudges to the exact
  //    final target.
  useLayoutEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) {
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const container = desktopContainerRef.current;
    if (!container) return;

    // Champion round: the container is tall (items-stretch matches the
    // tallest round column) but the champion content sits at the vertical
    // center via justify-center. Scroll so that center is in the viewport.
    if (activeRound === championRoundIdx) {
      void document.documentElement.offsetHeight;
      const rect = container.getBoundingClientRect();
      const containerCenterY = window.scrollY + rect.top + rect.height / 2;
      const targetY = Math.max(0, containerCenterY - window.innerHeight / 2);
      window.scrollTo({ top: targetY, behavior: "smooth" });

      const correctionTimer = setTimeout(() => {
        const r = container.getBoundingClientRect();
        const cy = window.scrollY + r.top + r.height / 2;
        const t = Math.max(0, cy - window.innerHeight / 2);
        if (Math.abs(window.scrollY - t) > 20) {
          window.scrollTo({ top: t, behavior: "smooth" });
        }
      }, 550);
      return () => clearTimeout(correctionTimer);
    }

    // Target the first UNVOTED matchup of the active round (not match 0),
    // so jumping back to a partially-played round lands where you left off.
    const round = bracket.rounds[activeRound];
    if (!round || round.length === 0) return;
    let targetIdx = 0;
    const nextUnvoted = round.findIndex(
      (m) => m.winner === null && m.seedA >= 0 && m.seedB >= 0,
    );
    if (nextUnvoted >= 0) targetIdx = nextUnvoted;

    const fractionY = (targetIdx + 0.5) / round.length;
    const computeTarget = () => {
      const rect = container.getBoundingClientRect();
      const matchupCenterY = window.scrollY + rect.top + rect.height * fractionY;
      return Math.max(0, matchupCenterY - window.innerHeight / 2);
    };

    // Aggressive layout flush — forces full-document layout so the new
    // inline styles on the round wrappers are committed to the box model
    // before we measure. Firefox needs this; Chrome/Safari tolerate less.
    void document.documentElement.offsetHeight;

    // First pass: runs in parallel with the CSS transition (Chrome/Safari
    // hit the final target on this alone).
    window.scrollTo({ top: computeTarget(), behavior: "smooth" });

    // Second pass: after the CSS transition has fully settled, measure
    // again and nudge if we ended up more than a tolerance off. Firefox
    // uses this to recover from a stalled smooth-scroll.
    const correctionTimer = setTimeout(() => {
      const finalTarget = computeTarget();
      if (Math.abs(window.scrollY - finalTarget) > 20) {
        window.scrollTo({ top: finalTarget, behavior: "smooth" });
      }
    }, 550);

    return () => clearTimeout(correctionTimer);
  }, [activeRound]); // eslint-disable-line react-hooks/exhaustive-deps


  // Action row shown beneath the champion card once the bracket is
  // complete. Identical markup for desktop and mobile — rendered inline
  // in both champion views below. Anonymous users get a "sign in" prompt
  // above the share/link buttons.
  const championFooter = champion ? (
    <div className="mt-6 max-w-md mx-auto px-2 space-y-3">
      {!isLoggedIn && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left">
          <p className="text-sm text-amber-100 mb-2">
            Sign in to save this bracket to your account and share your history.
          </p>
          <Link
            href={`/auth?returnTo=${typeof window !== "undefined" ? encodeURIComponent(window.location.pathname + window.location.search) : "/my/brackets"}`}
            className="inline-block px-3 py-1.5 rounded-lg bg-amber-500 text-gray-900 text-xs font-semibold hover:bg-amber-400 transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}
      <div className="flex flex-wrap gap-2 justify-center">
        {seedId && (
          <button
            onClick={copyPlayLink}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/40 transition-colors cursor-pointer"
          >
            {copied === "play" ? "Copied!" : "Copy Play Link"}
          </button>
        )}
        {completionId && (
          <button
            onClick={copyResultsLink}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/40 transition-colors cursor-pointer"
          >
            {copied === "results" ? "Copied!" : "Copy Results"}
          </button>
        )}
        <Link
          href={`/card/${champion.slug}`}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 transition-colors"
        >
          View {champion.name}
        </Link>
        <Link
          href="/brews?mode=bracket"
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 transition-colors"
        >
          More bracket brews
        </Link>
        {isLoggedIn && (
          <Link
            href="/my/brackets"
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 transition-colors"
          >
            My Brackets
          </Link>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      // overflow-x-clip stops the wide bracket row from making the page
      // itself horizontally scrollable. `clip` (not `hidden`) avoids
      // creating a scroll container, so sticky top: 0 on the header still
      // works and vertical overflow isn't affected.
      className="min-h-screen bg-gray-950 text-white overflow-x-clip"
    >
      {/* Sticky header: round tabs + progress bar.
          z-40 so it sits above the in-bracket card overlays:
          name/artist labels (z-10) AND CardPreviewOverlay's zoom icon
          (z-30). Stays below the preview overlay itself (z-50) so the
          full-card hover popup still covers the nav as intended.

          Top offset transitions between top-14 (under the global nav)
          and top: 0 (flush to viewport when global nav is hidden), in
          sync with the navbar's slide animation. Both mobile and desktop
          use the same offset because the nav is sticky on mobile too
          for focus-mode routes — see Navbar's isShowdown comment. */}
      <div
        className={`sticky top-0 z-40 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 transition-[top] duration-300 ease-in-out ${navHidden ? "" : "top-14"}`}
      >
        <div className="flex items-center">
        {/* Panel-top toggle — reveals / dismisses the global navbar.
            Outer rectangle with a bar near the top is an unambiguous
            "top nav panel" metaphor (unlike a bare chevron, which reads
            as "scroll to top/bottom"). The inner chevron rotates 180°
            to indicate direction: points DOWN when nav is hidden ("tap
            to pull it down") and UP when visible ("tap to send it up").
            The outer shape stays fixed so the panel metaphor is always
            present; only the inner chevron flips. Rotation duration
            matches the nav slide so the two feel like one motion.
            Lives outside the scrollable tabs container so it stays
            pinned even when tab overflow scrolls. */}
        <button
          onClick={() => setNavHidden(!navHidden)}
          title={navHidden ? "Show site nav" : "Hide site nav"}
          aria-label={navHidden ? "Show site nav" : "Hide site nav"}
          className="flex-shrink-0 px-3 py-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Panel outline */}
            <rect x="3" y="3" width="18" height="18" rx="2" />
            {/* Top bar — the nav */}
            <line x1="3" y1="9" x2="21" y2="9" />
            {/* Direction indicator — rotates on toggle */}
            <g
              className="transition-transform duration-300 ease-in-out"
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                transform: navHidden ? undefined : "rotate(180deg)",
              }}
            >
              <path d="m9 13 3 3 3-3" />
            </g>
          </svg>
        </button>
        {/* Desktop: horizontally-scrollable row of all round tabs. */}
        <div
          ref={roundTabsRef}
          className="hidden md:flex gap-1.5 py-2 overflow-x-auto scrollbar-hide flex-1 min-w-0"
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

        {/* Mobile: single-tab carousel. Shows only the active round and
            slides horizontally to the next/prev when activeRound changes
            (via voting, swipe, or auto-advance). Leaves room for the
            fixed cog button on the right. */}
        <div className="md:hidden flex-1 min-w-0 overflow-hidden py-2">
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${activeRound * 100}%)` }}
          >
            {progress.roundNames.map((name, i) => {
              const rp = progress.roundProgress[i];
              return (
                <div
                  key={i}
                  className="w-full flex-shrink-0 flex items-center justify-center"
                >
                  <div className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-gray-900">
                    <span>{name}</span>
                    {rp.total > 0 && (
                      <span className="ml-1.5 opacity-70">
                        {rp.completed}/{rp.total}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Champion slide */}
            <div className="w-full flex-shrink-0 flex items-center justify-center">
              <div
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  champion
                    ? "bg-amber-500 text-gray-900"
                    : "bg-gray-900 text-gray-600"
                }`}
              >
                Champion
              </div>
            </div>
          </div>
        </div>

        {/* Right-side: truncated bracket name + cog dropdown (both
            breakpoints). The cog holds image toggle, restart, and close.
            Bracket name is capped at ~20 chars visually via max-w and
            truncate, with a native title tooltip for the full name. */}
        <div className="flex items-center gap-2 pl-2 pr-3 flex-shrink-0">
          {bracketName && (
            <span className="hidden md:inline relative group">
              <span className="text-xs text-gray-400 font-medium truncate max-w-[140px] block cursor-default">
                {bracketName}
              </span>
              {/* CSS-only tooltip on hover — shows the full name below */}
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-200 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                {bracketName}
              </span>
            </span>
          )}
        </div>
        <div ref={mobileSettingsRef} className="flex-shrink-0 relative pr-2">
          <button
            onClick={() => setMobileSettingsOpen((v) => !v)}
            title="Bracket settings"
            aria-label="Bracket settings"
            className="p-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {mobileSettingsOpen && (
            <div className="absolute top-full right-2 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[200px] z-50">
              {bracketName && (
                <div className="px-3 py-2 border-b border-gray-800">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Bracket</p>
                  <p className="text-sm font-medium text-white truncate">{bracketName}</p>
                </div>
              )}
              {/* Card / Art toggle */}
              <div className="px-3 py-2">
                <button
                  onClick={() => { toggleImageMode(); setMobileSettingsOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/40 transition-colors cursor-pointer"
                >
                  {/* Toggle icon: two arrows forming a cycle */}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  {imageMode === "art" ? "Art" : "Card"} mode <span className="hidden md:inline text-amber-400/50 text-xs">(W)</span>
                </button>
              </div>
              {/* New Bracket — navigates to /bracket to show the creation modal */}
              <div className="px-3 py-1.5">
                <a
                  href="/bracket"
                  onClick={() => setMobileSettingsOpen(false)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New Bracket
                </a>
              </div>
              {onRestart && (
                <div className="px-3 py-1.5">
                  <button
                    onClick={() => {
                      setMobileSettingsOpen(false);
                      setShowRestartModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Restart bracket
                  </button>
                </div>
              )}
              <div className="px-3 pt-1 pb-2">
                <button
                  onClick={() => setMobileSettingsOpen(false)}
                  className="w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-700 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
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
                {championExtra ?? championFooter}
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
      <div ref={desktopContainerRef} className="hidden md:flex items-stretch px-4 pb-20">
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
                      hideOverlays={isFuture}
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
          <div className="flex flex-col justify-center flex-1 min-w-0">
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
                {championExtra ?? championFooter}
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

      {/* Restart confirmation modal */}
      {showRestartModal && (
        <div
          onClick={() => setShowRestartModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-white mb-2">Restart bracket?</h3>
            <p className="text-sm text-gray-400 mb-6">
              This will clear your current progress and start fresh with a new set of cards.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRestartModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRestartModal(false);
                  // Reset the bracket in-place: same cards, fresh votes.
                  const fresh = createBracket(cards);
                  setBracket(fresh);
                  saveBracket(fresh, slug);
                  setActiveRound(0);
                  savedToHistoryRef.current = false;
                  // Clear the submission guard so ELO can be recorded again
                  if (typeof window !== "undefined") {
                    sessionStorage.removeItem(`bracket_submitted_${slug}`);
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-500 text-white font-medium transition-colors cursor-pointer"
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}
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
  const isCardMode = imageMode === "card";

  // Mobile card-mode selection state — first tap selects (shows amber
  // ring + "Tap again to vote"), second tap on the same card confirms.
  // For already-voted matchups the selection step is skipped (single
  // tap undoes or switches the vote).
  const [selectedSeed, setSelectedSeed] = useState<number | null>(null);

  // Reset selection when the matchup changes (round advance / swipe).
  useEffect(() => {
    setSelectedSeed(null);
  }, [roundIndex, matchupIndex]);

  const isMobileCard = isCardMode && typeof window !== "undefined" && window.innerWidth < 768;

  function handleClick(seed: number) {
    if (hasWinner) {
      // Already voted — single tap to toggle/undo.
      onVote(roundIndex, matchupIndex, seed);
      return;
    }
    if (isMobileCard) {
      if (selectedSeed === seed) {
        setSelectedSeed(null);
        onVote(roundIndex, matchupIndex, seed);
      } else {
        setSelectedSeed(seed);
      }
      return;
    }
    onVote(roundIndex, matchupIndex, seed);
  }

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

  function renderSide(card: BracketCard, seed: number, hideOverlays = false) {
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
            onClick={() => handleClick(seed)}
            className="w-full"
          />
          {!hideOverlays && (
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
          )}
          {isWinner && (
            <div className="absolute top-2 right-2 z-10 pointer-events-none">
              <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
          {!hideOverlays && (
            <div className="absolute bottom-2 right-2 z-10 text-right pointer-events-none">
              <p className={`text-xs font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isWinner ? "text-amber-300" : "text-white"}`}>{card.name}</p>
              <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.artist}</p>
              <p className="text-[10px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.set_code.toUpperCase()}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /** Wrap a card in the selection ring + "Tap again to vote" overlay
   *  for mobile card mode. Mirrors VoteGrid's wrapSide pattern. */
  function wrapSelected(node: React.ReactNode, seed: number) {
    const isSelected = selectedSeed === seed && isMobileCard && !hasWinner;
    return (
      <div className={`relative transition-shadow duration-200 rounded-[5%] ${isSelected ? "ring-2 ring-inset ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]" : ""}`}>
        {node}
        {isSelected && (
          <div className="absolute bottom-0 left-0 right-0 rounded-b-[5%] pointer-events-none">
            <div className="h-12 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
            <div className="bg-black/90 px-3 py-1.5 rounded-b-[5%]">
              <p className="text-center text-xs font-medium text-amber-400">Tap again to vote</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1 px-1">
        Match {matchupNumber} of {totalInRound}
      </p>
      {/* Card mode on mobile: stacked/fanned layout (same as showdown),
          no overlays, two-tap selection. Selected card comes to front
          via z-index boost. Desktop + art mode: side-by-side grid. */}
      {isCardMode ? (
        <>
          <div className="md:hidden">
            <StackedCardLayout
              leftOnTop={selectedSeed === seedA}
              left={wrapSelected(renderSide(cardA, seedA, true), seedA)}
              right={wrapSelected(renderSide(cardB, seedB, true), seedB)}
            />
          </div>
          <div className="hidden md:grid md:grid-cols-2 md:gap-6">
            {renderSide(cardA, seedA, true)}
            {renderSide(cardB, seedB, true)}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
          {renderSide(cardA, seedA)}
          {renderSide(cardB, seedB)}
        </div>
      )}
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
  hideOverlays = false,
}: {
  bracket: BracketState;
  matchup: BracketMatchup;
  roundIndex: number;
  matchupIndex: number;
  matchupNumber?: number;
  totalInRound?: number;
  onVote?: (round: number, matchup: number, winner: number) => void;
  // Suppress the zoom button + card name/artist label overlays. Used for
  // future rounds on desktop, where cards are previews of what's coming
  // and the overlays just add visual noise to the column.
  hideOverlays?: boolean;
}) {
  const { cardUrl, imageMode } = useImageMode();
  // In card mode the full card already shows name/artist/set — overlays
  // are redundant and obscure the card frame.
  const effectiveHideOverlays = hideOverlays || imageMode === "card";
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
          {!effectiveHideOverlays && (
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
          )}
          {isWinner && (
            <div className="absolute top-1 right-1 z-10 pointer-events-none">
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
          {!effectiveHideOverlays && (
            <div className="absolute bottom-1 right-1 z-10 text-right pointer-events-none">
              <p className={`text-[10px] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isWinner ? "text-amber-300" : "text-white"}`}>{card.name}</p>
              <p className="text-[9px] text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.artist}</p>
            </div>
          )}
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
