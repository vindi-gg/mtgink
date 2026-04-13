"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";

interface PoolEntry {
  oracle_id: string;
  illustration_id: string;
  name: string;
  slug: string;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_version: string | null;
  type_line: string | null;
  mana_cost: string | null;
}

interface Challenge {
  id: number;
  challenge_date: string;
  challenge_type: string;
  pool: PoolEntry[] | null;
  gauntlet_mode: string | null;
  theme_id: number | null;
  brew_id: string | null;
  title: string;
  description: string | null;
  preview_set_code: string | null;
  preview_collector_number: string | null;
  preview_image_version: string | null;
}

interface Theme {
  id: number;
  label: string;
  theme_type: string;
  pool_mode: string;
  description: string | null;
}

interface BrewResult {
  id: string;
  name: string;
  slug: string;
  mode: string;
  source: string;
  source_label: string;
  pool_size: number | null;
  pool: PoolEntry[] | null;
}

const PAGE_SIZE = 5;

function timeLabel(dateStr: string): { text: string; color: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(dateStr + "T00:00:00");
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: "Expired", color: "text-gray-600" };
  }
  if (diffDays === 0) {
    const endOfDay = new Date(tomorrow);
    const hoursLeft = Math.max(0, Math.round((endOfDay.getTime() - now.getTime()) / (1000 * 60 * 60)));
    return { text: `Live — ${hoursLeft}h left`, color: "text-green-400" };
  }
  if (diffDays === 1) {
    return { text: "Tomorrow", color: "text-amber-400" };
  }
  return { text: `In ${diffDays} days`, color: "text-gray-400" };
}

export default function AdminDailyClient({ days }: { days: number }) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Theme[]>([]);
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<"theme" | "brew">("theme");
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [brewQuery, setBrewQuery] = useState("");
  const [brewResults, setBrewResults] = useState<BrewResult[]>([]);
  const [searchingBrews, setSearchingBrews] = useState(false);
  // Pending action that needs confirmation (reset today's challenge).
  const [pendingAction, setPendingAction] = useState<{
    challengeId: number;
    label: string;
    execute: () => Promise<void>;
  } | null>(null);

  const totalPages = Math.ceil(days / PAGE_SIZE);

  /** Check if a challenge is for today (modifying it resets submissions). */
  function isTodayChallenge(c: Challenge): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return c.challenge_date === today;
  }

  /** Wrap an action: if the challenge is today, show confirmation first. */
  function withResetGuard(challenge: Challenge, action: () => Promise<void>) {
    const c = challenges.find((ch) => ch.id === challenge.id) ?? challenge;
    if (isTodayChallenge(c)) {
      setPendingAction({
        challengeId: c.id,
        label: c.title,
        execute: async () => {
          // Delete submissions + reset stats before executing
          await fetch(`/api/admin/daily/${c.id}/reset`, { method: "POST" });
          await action();
          setPendingAction(null);
        },
      });
    } else {
      action();
    }
  }

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    const offset = p * PAGE_SIZE;
    const res = await fetch(`/api/admin/daily?days=${days}&offset=${offset}&limit=${PAGE_SIZE}`);
    const data = await res.json();
    setChallenges(data.challenges ?? []);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  async function doRandomTheme(challengeId: number, type?: string) {
    setRegenerating(challengeId);
    const typeParam = type ? `&type=${type}` : "";
    const res = await fetch(`/api/admin/themes?random=1${typeParam}`);
    const { theme } = await res.json();
    if (!theme) { setRegenerating(null); return; }

    const regen = await fetch(`/api/admin/daily/${challengeId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme_id: theme.id }),
    });
    if (regen.ok) {
      const { challenge } = await regen.json();
      setChallenges((prev) => prev.map((c) => (c.id === challengeId ? challenge : c)));
    }
    setRegenerating(null);
    setEditingId(null);
  }

  function handleRandomTheme(challengeId: number, type?: string) {
    const c = challenges.find((ch) => ch.id === challengeId);
    if (c) {
      withResetGuard(c, () => doRandomTheme(challengeId, type));
    } else {
      doRandomTheme(challengeId, type);
    }
  }

  async function doSelectTheme(challengeId: number, themeId: number) {
    setRegenerating(challengeId);
    const res = await fetch(`/api/admin/daily/${challengeId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme_id: themeId }),
    });
    if (res.ok) {
      const { challenge } = await res.json();
      setChallenges((prev) => prev.map((c) => (c.id === challengeId ? challenge : c)));
    }
    setRegenerating(null);
    setEditingId(null);
    setSearchQuery("");
    setSearchResults([]);
  }

  function handleSelectTheme(challengeId: number, themeId: number) {
    const c = challenges.find((ch) => ch.id === challengeId);
    if (c) {
      withResetGuard(c, () => doSelectTheme(challengeId, themeId));
    } else {
      doSelectTheme(challengeId, themeId);
    }
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/admin/themes?q=${encodeURIComponent(q)}`);
    const { themes } = await res.json();
    setSearchResults(themes ?? []);
    setSearching(false);
  }

  async function handleBrewSearch(q: string) {
    setBrewQuery(q);
    if (q.length < 2) { setBrewResults([]); return; }
    setSearchingBrews(true);

    // Check if the input looks like a direct URL or slug (contains "/" or
    // no spaces). If so, try a direct slug lookup first — this is the
    // "paste a URL to override" escape hatch for assigning public brews.
    const slugMatch = q.match(/\/brew\/([a-z0-9-]+)/i)?.[1] ?? (!/\s/.test(q) ? q : null);
    if (slugMatch) {
      try {
        const directRes = await fetch(`/api/brew/${slugMatch}`);
        if (directRes.ok) {
          const brew = await directRes.json();
          if (brew && brew.id) {
            setBrewResults([brew]);
            setSearchingBrews(false);
            return;
          }
        }
      } catch { /* fall through to search */ }
    }

    // Default: only show private (daily-only) brews in search.
    const res = await fetch(`/api/brew?q=${encodeURIComponent(q)}&sort=newest&limit=10&all=true&daily_only=true`);
    const { brews } = await res.json();
    setBrewResults(brews ?? []);
    setSearchingBrews(false);
  }

  async function doAssignBrew(challengeId: number, brew: BrewResult) {
    setRegenerating(challengeId);
    const challenge = challenges.find((c) => c.id === challengeId);
    const isBracket = challenge?.challenge_type === "bracket";
    const poolSize = brew.pool?.length ?? 0;
    const res = await fetch(`/api/admin/daily/${challengeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brew_id: brew.id,
        pool: brew.pool,
        gauntlet_mode: brew.mode === "remix" ? "remix" : "vs",
        title: brew.name,
        description: isBracket
          ? `${poolSize}-card bracket: ${brew.source_label}`
          : `Brew: ${brew.source_label}`,
        // For bracket challenges, match bracket_size to the brew's pool
        ...(isBracket && poolSize > 0 ? { bracket_size: poolSize } : {}),
      }),
    });
    if (res.ok) {
      const { challenge } = await res.json();
      setChallenges((prev) => prev.map((c) => (c.id === challengeId ? challenge : c)));
    }
    setRegenerating(null);
    setEditingId(null);
    setBrewQuery("");
    setBrewResults([]);
  }

  function handleAssignBrew(challengeId: number, brew: BrewResult) {
    const c = challenges.find((ch) => ch.id === challengeId);
    if (c) {
      withResetGuard(c, () => doAssignBrew(challengeId, brew));
    } else {
      doAssignBrew(challengeId, brew);
    }
  }

  // Group by date
  const byDate = new Map<string, Challenge[]>();
  for (const c of challenges) {
    const existing = byDate.get(c.challenge_date) ?? [];
    existing.push(c);
    byDate.set(c.challenge_date, existing);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8 px-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Daily Challenges</h1>
          <p className="text-gray-400 text-sm mt-1">
            Page {page + 1} of {totalPages} ({days} days)
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {[7, 14, 30, 60].map((d) => (
            <Link
              key={d}
              href={`/admin/daily?days=${d}`}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                d === days
                  ? "bg-amber-500 text-black font-medium"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          Prev
        </button>
        <div className="flex gap-1">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            // Show pages around current
            let pageNum: number;
            if (totalPages <= 10) {
              pageNum = i;
            } else if (page < 5) {
              pageNum = i;
            } else if (page > totalPages - 6) {
              pageNum = totalPages - 10 + i;
            } else {
              pageNum = page - 4 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-8 h-8 text-sm rounded-lg transition-colors cursor-pointer ${
                  pageNum === page
                    ? "bg-amber-500 text-black font-medium"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {pageNum + 1}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-6">
          {Array.from(byDate.entries()).map(([date, dayChallenges]) => {
            const isToday = date === today;
            const dateObj = new Date(date + "T12:00:00");
            const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
            const dateLabel = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const { text: statusText, color: statusColor } = timeLabel(date);

            return (
              <div
                key={date}
                className={`border rounded-xl p-4 ${
                  isToday ? "border-amber-500/50 bg-amber-500/5" : "border-gray-800 bg-gray-900/50"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-sm font-medium">
                    <span className={isToday ? "text-amber-400" : "text-gray-400"}>{dayName}</span>{" "}
                    <span className="text-white">{dateLabel}</span>
                    {isToday && (
                      <span className="ml-2 text-xs bg-amber-500 text-black px-1.5 py-0.5 rounded">TODAY</span>
                    )}
                  </div>
                  <span className={`text-xs ${statusColor}`}>{statusText}</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {dayChallenges.map((c) => (
                    <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          {c.challenge_type}
                        </span>
                        {c.gauntlet_mode && (
                          <span className="text-xs text-gray-500">mode: {c.gauntlet_mode}</span>
                        )}
                        <span className="text-sm font-medium text-white ml-1">{c.title}</span>
                      </div>

                      {c.description && <p className="text-xs text-gray-500 mb-3">{c.description}</p>}

                      {/* Pool grid */}
                      {c.pool && c.pool.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-2">
                            {c.pool.length} cards
                            {c.pool[0].artist && c.pool.every((p) => p.artist === c.pool![0].artist) && (
                              <span className="text-gray-400"> — all by {c.pool[0].artist}</span>
                            )}
                          </p>
                          <div className="grid grid-cols-5 gap-1.5">
                            {c.pool.slice(0, 10).map((entry) => (
                              <div key={entry.illustration_id}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={artCropUrl(entry.set_code, entry.collector_number, entry.image_version)}
                                  alt={entry.name}
                                  className="w-full rounded aspect-[4/3] object-cover"
                                />
                                <p className="text-[10px] text-gray-500 mt-0.5 truncate">{entry.name}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Theme editing — gauntlet + bracket */}
                      {(c.challenge_type === "gauntlet" || c.challenge_type === "bracket") && (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                          {editingId === c.id ? (
                            <div className="space-y-2">
                              {/* Tab toggle */}
                              <div className="flex gap-2 mb-2">
                                <button
                                  onClick={() => setEditMode("brew")}
                                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${editMode === "brew" ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                                >
                                  Assign Brew
                                </button>
                                <button
                                  onClick={() => setEditMode("theme")}
                                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${editMode === "theme" ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                                >
                                  Random Theme
                                </button>
                                <button
                                  onClick={() => { setEditingId(null); setSearchQuery(""); setSearchResults([]); setBrewQuery(""); setBrewResults([]); }}
                                  className="px-3 py-1 text-xs text-gray-400 hover:text-white cursor-pointer ml-auto"
                                >
                                  Cancel
                                </button>
                              </div>

                              {editMode === "brew" ? (
                                <>
                                  <input
                                    type="text"
                                    value={brewQuery}
                                    onChange={(e) => handleBrewSearch(e.target.value)}
                                    placeholder="Search daily brews or paste a brew URL..."
                                    className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                                  />
                                  {searchingBrews && <p className="text-xs text-gray-500">Searching...</p>}
                                  {brewResults.length > 0 && (
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                      {brewResults.map((brew) => (
                                        <button
                                          key={brew.id}
                                          onClick={() => handleAssignBrew(c.id, brew)}
                                          disabled={regenerating === c.id}
                                          className="w-full text-left px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                                        >
                                          <span className="text-white">{brew.name}</span>
                                          <span className="text-xs text-gray-500">{brew.source_label} · {brew.pool?.length ?? "?"} cards</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    placeholder="Search themes..."
                                    className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                                  />
                                  <div className="flex flex-wrap gap-1.5">
                                    {[
                                      { type: undefined, label: "Any" },
                                      { type: "tribe", label: "Tribe" },
                                      { type: "set", label: "Set" },
                                      { type: "artist", label: "Artist" },
                                      { type: "card_remix", label: "Card" },
                                      { type: "tag", label: "Tag" },
                                      { type: "art_tag", label: "Art Tag" },
                                    ].map((opt) => (
                                      <button
                                        key={opt.label}
                                        onClick={() => handleRandomTheme(c.id, opt.type)}
                                        disabled={regenerating === c.id}
                                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-800 text-gray-300 hover:bg-amber-500 hover:text-black disabled:opacity-50 cursor-pointer transition-colors"
                                      >
                                        {regenerating === c.id ? "..." : `Random ${opt.label}`}
                                      </button>
                                    ))}
                                  </div>
                                  {searching && <p className="text-xs text-gray-500">Searching...</p>}
                                  {searchResults.length > 0 && (
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                      {searchResults.map((theme) => (
                                        <button
                                          key={theme.id}
                                          onClick={() => handleSelectTheme(c.id, theme.id)}
                                          disabled={regenerating === c.id}
                                          className="w-full text-left px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                                        >
                                          <span className="text-white">{theme.label}</span>
                                          <span className="text-xs text-gray-500">{theme.theme_type} · {theme.pool_mode}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-3">
                              <button
                                onClick={() => { setEditingId(c.id); setEditMode("brew"); }}
                                className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                              >
                                Assign Brew
                              </button>
                              <button
                                onClick={() => { setEditingId(c.id); setEditMode("theme"); }}
                                className="text-xs text-gray-400 hover:text-gray-300 cursor-pointer"
                              >
                                Random Theme
                              </button>
                              {c.brew_id && (
                                <span className="text-xs text-green-400">✓ Brew assigned</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Reset confirmation modal */}
      {pendingAction && (
        <div
          onClick={() => setPendingAction(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900 border border-red-500/30 rounded-xl p-6 max-w-sm w-full shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-red-400 mb-2">Reset active challenge?</h3>
            <p className="text-sm text-gray-300 mb-1">
              <strong>{pendingAction.label}</strong> is today&apos;s live challenge.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Changing it will <strong className="text-red-400">delete all current submissions</strong> and
              reset participation stats. Players who already completed it will be able to play again.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingAction(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => pendingAction.execute()}
                className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-500 text-white font-medium transition-colors cursor-pointer"
              >
                Reset &amp; Update
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
