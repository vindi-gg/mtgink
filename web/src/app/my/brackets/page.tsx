"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadBracketHistoryLocal, clearBracketHistoryLocal, type BracketHistoryEntry } from "@/lib/bracket-history";
import { artCropUrl } from "@/lib/image-utils";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function MyBracketsPage() {
  const [history, setHistory] = useState<BracketHistoryEntry[] | null>(null);
  const [source, setSource] = useState<"db" | "local" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Auth check — pick DB path for logged-in users, localStorage for anon.
      const supabase = createClient();
      let user = null;
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      }

      if (user) {
        // Migrate localStorage entries to DB. Only runs if there are
        // entries to migrate — no flag needed since we clear immediately.
        const localEntries = loadBracketHistoryLocal();
        if (localEntries.length > 0) {
          // Clear synchronously FIRST so a double-fire reads empty.
          clearBracketHistoryLocal();
          const completedEntries = localEntries.filter(
            (e) => e.champion && e.champion.oracle_id && e.champion.illustration_id && e.champion.slug && e.cardCount >= 2,
          );
          if (completedEntries.length > 0) {
            await Promise.allSettled(
              completedEntries.map((entry) =>
                fetch("/api/bracket/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    brew_slug: entry.brewSlug,
                    brew_name: entry.brewName,
                    card_count: entry.cardCount,
                    champion: entry.champion,
                  }),
                }).catch(() => null),
              ),
            );
          }
        }

        try {
          const res = await fetch("/api/bracket/saved");
          if (res.ok) {
            const data = (await res.json()) as { brackets: BracketHistoryEntry[] };
            if (!cancelled) {
              setHistory(data.brackets);
              setSource("db");
            }
            return;
          }
        } catch {
          // fall through to local
        }
      }

      if (!cancelled) {
        setHistory(loadBracketHistoryLocal());
        setSource("local");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (history === null) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">My Brackets</h1>
      <p className="text-sm text-gray-500 mb-8">
        {source === "db"
          ? "Completed brackets, saved to your account."
          : "Completed brackets, saved on this device."}
        {source === "local" && (
          <>
            {" "}
            <Link href="/auth" className="text-amber-400 hover:text-amber-300 underline">
              Sign in
            </Link>
            {" "}to save them to your account.
          </>
        )}
      </p>

      {history.length === 0 ? (
        <div className="text-center py-12 border border-gray-800 rounded-xl bg-gray-900/40">
          <p className="text-gray-400 mb-6">You haven&apos;t completed any brackets yet.</p>
          <Link
            href="/bracket"
            className="inline-block px-4 py-2 rounded-lg bg-amber-500 text-gray-900 font-semibold hover:bg-amber-400 transition-colors"
          >
            Start a bracket
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {history.map((entry) => {
            const champ = entry.champion;
            const img = artCropUrl(champ.set_code, champ.collector_number, champ.image_version);
            const isDaily = !!entry.brewName?.startsWith("Daily Bracket");
            // View: completion results page if available, else daily results, else bracket page
            const viewHref = entry.completionId
              ? `/bracket/results/${entry.completionId}`
              : isDaily
                ? `/daily/bracket/results?date=${entry.completedAt.slice(0, 10)}`
                : entry.brewSlug
                  ? `/bracket?brew=${entry.brewSlug}`
                  : "/bracket";
            // Share play link: seed URL if available, else brew URL
            const playHref = entry.seedId
              ? `/bracket?seed=${entry.seedId}`
              : entry.brewSlug
                ? `/bracket?brew=${entry.brewSlug}`
                : null;
            return (
              <div
                key={entry.id}
                className="flex items-center gap-4 p-3 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <Link href={`/card/${champ.slug}`} className="flex-shrink-0">
                  <img
                    src={img}
                    alt={champ.name}
                    className="w-24 h-[69px] object-cover rounded-md border border-gray-800"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs uppercase tracking-wide text-amber-400">
                      Champion
                    </p>
                    {isDaily && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-400 tracking-wide">
                        Daily
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/card/${champ.slug}`}
                    className="block font-semibold text-white truncate hover:text-amber-300 transition-colors"
                  >
                    {champ.name}
                  </Link>
                  <p className="text-xs text-gray-500 truncate">
                    {champ.artist} · {champ.set_code.toUpperCase()}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    {entry.brewName ? `${entry.brewName} · ` : ""}
                    {entry.cardCount} cards · {formatDate(entry.completedAt)}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <Link
                    href={viewHref}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/40 transition-colors text-center"
                  >
                    View Bracket
                  </Link>
                  {playHref && (
                    <Link
                      href={playHref}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 transition-colors text-center"
                    >
                      Share (Play)
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
