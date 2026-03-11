"use client";

import { useState, useEffect } from "react";
import { artCropUrl } from "@/lib/image-utils";

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

interface RecentGauntlet {
  id: number;
  mode: string;
  pool_size: number;
  champion_name: string;
  champion_wins: number;
  results: {
    set_code: string;
    collector_number: string;
  }[];
  card_name: string | null;
  filter_label: string | null;
  completed_at: string;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function RecentActivity() {
  const [gauntlets, setGauntlets] = useState<RecentGauntlet[]>([]);

  useEffect(() => {
    const sessionId = getSessionId();
    fetch(`/api/gauntlet/recent?session_id=${sessionId}&limit=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.gauntlets) setGauntlets(data.gauntlets);
      })
      .catch(() => {});
  }, []);

  if (gauntlets.length === 0) return null;

  return (
    <div className="mt-8 border-t border-gray-800 pt-6">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 text-center">
        Recent Gauntlets
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2 justify-center">
        {gauntlets.map((g) => {
          const champion = g.results[g.results.length - 1];
          return (
            <div
              key={g.id}
              className="flex items-center gap-2 bg-gray-900/50 rounded-lg px-3 py-2 shrink-0"
            >
              {champion && (
                <img
                  src={artCropUrl(champion.set_code, champion.collector_number, null)}
                  alt={g.champion_name}
                  className="w-10 h-10 object-cover rounded ring-1 ring-amber-500/30"
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-400 truncate max-w-[120px]">
                  {g.champion_name}
                </p>
                <p className="text-[10px] text-gray-500">
                  {g.champion_wins}W · {g.pool_size} cards · {timeAgo(g.completed_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
