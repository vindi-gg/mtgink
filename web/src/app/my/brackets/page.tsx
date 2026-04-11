"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadBracketHistoryLocal, type BracketHistoryEntry } from "@/lib/bracket-history";
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
            const bracketHref = entry.brewSlug
              ? `/bracket?brew=${entry.brewSlug}`
              : "/bracket";
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
                  <p className="text-xs uppercase tracking-wide text-amber-400 mb-0.5">
                    Champion
                  </p>
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
                <Link
                  href={bracketHref}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 transition-colors"
                >
                  Replay
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
