"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Brew } from "@/lib/types";
import { brewToShowdownUrl } from "@/lib/brew-utils";
import { artCropUrl } from "@/lib/image-utils";
import { useImageMode } from "@/lib/image-mode";
import { createClient } from "@/lib/supabase/client";

const MODE_COLORS: Record<string, string> = {
  remix: "bg-amber-500/20 text-amber-400",
  vs: "bg-blue-500/20 text-blue-400",
  gauntlet: "bg-red-500/20 text-red-400",
};

interface BrewChampion {
  name: string;
  illustration_id: string;
  oracle_id: string;
  count: number;
  best_wins: number;
  set_code?: string;
  collector_number?: string;
}

interface BrewResults {
  total_plays: number;
  top_champions: BrewChampion[];
  recent: Array<{
    id: number;
    champion_name: string;
    champion_wins: number;
    pool_size: number;
    completed_at: string;
  }>;
}

export default function BrewDetail({ brew }: { brew: Brew }) {
  const router = useRouter();
  const { cardUrl } = useImageMode();
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [results, setResults] = useState<BrewResults | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user && user.id === brew.user_id) setIsOwner(true);
      });
    }
  }, [brew.user_id]);

  useEffect(() => {
    fetch(`/api/brew/${brew.slug}/results`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setResults(data); })
      .catch(() => {});
  }, [brew.slug]);

  const handlePlay = () => {
    setPlaying(true);
    router.push(brewToShowdownUrl(brew));
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this brew?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/brew/${brew.slug}`, { method: "DELETE" });
      router.push("/brew");
    } catch {
      setDeleting(false);
    }
  };

  const showdownUrl = brewToShowdownUrl(brew);

  return (
    <div className="space-y-6">
      {/* Preview image */}
      {brew.preview_set_code && brew.preview_collector_number && (
        <div className="relative aspect-[3/2] w-full max-w-lg mx-auto rounded-xl overflow-hidden">
          <img
            src={artCropUrl(brew.preview_set_code, brew.preview_collector_number, brew.preview_image_version)}
            alt={brew.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">{brew.name}</h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${MODE_COLORS[brew.mode] ?? "bg-gray-700 text-gray-300"}`}>
            {brew.mode}
          </span>
        </div>
        {brew.description && (
          <p className="text-gray-400">{brew.description}</p>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400">
        <span>Source: <span className="text-gray-200">{brew.source_label}</span></span>
        {brew.colors && brew.colors.length > 0 && (
          <span>Colors: <span className="text-gray-200">{brew.colors.join(", ")}</span></span>
        )}
        {brew.card_type && (
          <span>Type: <span className="text-gray-200">{brew.card_type}</span></span>
        )}
        {brew.subtype && (
          <span>Subtype: <span className="text-gray-200">{brew.subtype}</span></span>
        )}
        {brew.rules_text && (
          <span>Text: <span className="text-gray-200">&ldquo;{brew.rules_text}&rdquo;</span></span>
        )}
        {brew.pool_size && (
          <span>Pool: <span className="text-gray-200">{brew.pool_size}</span></span>
        )}
        <span>Plays: <span className="text-gray-200">{brew.play_count.toLocaleString()}</span></span>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handlePlay}
          disabled={playing}
          className="px-8 py-3 rounded-lg font-semibold text-sm bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {playing ? "Loading..." : "Play"}
        </button>

        <button
          onClick={handleCopy}
          className="px-6 py-3 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy Link"}
        </button>

        {isOwner && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-6 py-3 rounded-lg text-sm font-medium bg-gray-800 text-red-400 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>

      {/* Showdown URL preview */}
      <div className="text-xs text-gray-600">
        Launches: <code className="text-gray-500">{showdownUrl}</code>
      </div>

      {/* Community Results */}
      {results && results.total_plays > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-200">
            Community Results
            <span className="text-sm font-normal text-gray-500 ml-2">
              {results.total_plays} play{results.total_plays !== 1 ? "s" : ""}
            </span>
          </h2>

          {/* Top Champions */}
          {results.top_champions.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Top Champions</h3>
              <div className="space-y-1">
                {results.top_champions.map((champ, i) => (
                  <div
                    key={champ.oracle_id}
                    className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-gray-600 w-5 text-right font-mono">
                      #{i + 1}
                    </span>
                    {champ.set_code && champ.collector_number && (
                      <img
                        src={cardUrl(champ.set_code, champ.collector_number)}
                        alt={champ.name}
                        className="w-10 h-10 object-cover rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-200 truncate block">{champ.name}</span>
                      <span className="text-xs text-gray-500">
                        Won {champ.count} time{champ.count !== 1 ? "s" : ""}
                        {champ.best_wins > 0 && ` · Best: ${champ.best_wins}W`}
                      </span>
                    </div>
                    <span className="text-xs text-amber-400 font-medium">
                      {Math.round((champ.count / results.total_plays) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Plays */}
          {results.recent.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Recent Plays</h3>
              <div className="space-y-1">
                {results.recent.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between bg-gray-900/50 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-gray-200">{r.champion_name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {r.champion_wins}W / {r.pool_size - 1} matches
                      </span>
                    </div>
                    <span className="text-xs text-gray-600 whitespace-nowrap ml-2">
                      {new Date(r.completed_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
