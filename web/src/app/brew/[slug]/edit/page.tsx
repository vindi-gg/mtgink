"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useImageMode } from "@/lib/image-mode";
import type { Brew, GauntletEntry } from "@/lib/types";

const COLOR_LABELS: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

export default function BrewEditPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { cardUrl, imageMode, toggleImageMode } = useImageMode();

  const [brew, setBrew] = useState<Brew | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [pool, setPool] = useState<GauntletEntry[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [reResolving, setReResolving] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/brew/${slug}`);
      if (!res.ok) {
        setError("Brew not found");
        setLoading(false);
        return;
      }
      const data = await res.json() as Brew;

      const supabase = createClient();
      if (!supabase) { setError("Auth not configured"); setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      const isAdmin = !!user?.user_metadata?.is_admin;
      if (!user || (data.user_id !== user.id && !isAdmin)) {
        setError("Not authorized");
        setLoading(false);
        return;
      }

      setBrew(data);
      setName(data.name);
      setDescription(data.description ?? "");
      setIsPublic(data.is_public);
      setPool(data.pool ?? []);
      setLoading(false);
    }
    load();
  }, [slug]);

  const toggleRemove = (illustrationId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(illustrationId)) next.delete(illustrationId);
      else next.add(illustrationId);
      return next;
    });
  };

  const finalPool = pool.filter((e) => !removedIds.has(e.illustration_id));

  const handleSave = async () => {
    if (!brew) return;
    if (finalPool.length < 2) {
      setError("Pool must have at least 2 cards");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        description,
        is_public: isPublic,
      };
      // Only send pool if it changed
      if (removedIds.size > 0) {
        body.pool = finalPool;
        if (brew.mode === "bracket") {
          body.bracket_size = finalPool.length;
        } else {
          body.pool_size = finalPool.length;
        }
      }
      const res = await fetch(`/api/brew/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to save");
      }
      router.push(`/brew/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (error && !brew) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!brew) return null;

  const colorNames = brew.colors?.map((c) => COLOR_LABELS[c] ?? c) ?? [];

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edit Brew</h1>
          <Link href={`/brew/${slug}`} className="text-sm text-gray-400 hover:text-white">
            Cancel
          </Link>
        </div>

        <div className="grid md:grid-cols-[1fr_2fr] gap-6">
          {/* Left: metadata */}
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-500 mb-1 block">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-gray-500 mb-1 block">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!isPublic}
                onChange={(e) => setIsPublic(!e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-amber-500 bg-gray-800 focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-sm text-gray-300">Daily Challenge only (private)</span>
            </label>

            {/* Read-only info + re-resolve */}
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-1.5 text-xs">
              <p className="text-gray-500">Mode: <span className="text-gray-300">{brew.mode}</span></p>
              <p className="text-gray-500">Source: <span className="text-gray-300">{brew.source_label}</span></p>
              {colorNames.length > 0 && (
                <p className="text-gray-500">Colors: <span className="text-gray-300">{colorNames.join(", ")}</span></p>
              )}
              {brew.card_type && (
                <p className="text-gray-500">Type: <span className="text-gray-300">{brew.card_type}</span></p>
              )}
              <div className="flex flex-wrap gap-1 pt-1">
                {brew.include_children && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">child sets</span>}
                {brew.only_new_cards && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">new cards only</span>}
                {brew.first_illustration_only && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">first illust.</span>}
                {brew.last_illustration_only && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">highest card #</span>}
              </div>
              <button
                type="button"
                onClick={async () => {
                  setReResolving(true);
                  setError(null);
                  try {
                    const res = await fetch(`/api/brew/${slug}/re-resolve`, { method: "POST" });
                    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed");
                    const { pool: newPool } = await res.json();
                    setPool(newPool);
                    setRemovedIds(new Set());
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to re-resolve");
                  }
                  setReResolving(false);
                }}
                disabled={reResolving}
                className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {reResolving ? "Re-resolving..." : "Re-resolve pool from source"}
              </button>
              <p className="text-[9px] text-gray-600">Fetches a fresh pool using the stored source + filters. Review in the grid, then Save.</p>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="px-6 py-2.5 rounded-lg font-semibold text-sm bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <Link
                href={`/brew/${slug}`}
                className="px-6 py-2.5 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>

          {/* Right: pool editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-300">
                Pool
                <span className="text-gray-600 font-normal ml-1">
                  ({finalPool.length} of {pool.length} cards{removedIds.size > 0 ? ` · ${removedIds.size} removed` : ""})
                </span>
              </h2>
              <div className="flex items-center gap-2">
                {removedIds.size > 0 && (
                  <button
                    onClick={() => setRemovedIds(new Set())}
                    className="text-xs text-gray-400 hover:text-white cursor-pointer"
                  >
                    Undo all
                  </button>
                )}
                <button
                  onClick={toggleImageMode}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors cursor-pointer"
                >
                  {imageMode === "art" ? "Art" : "Card"} <span className="text-gray-500">(W)</span>
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-600">Click a card to remove it from the pool. Click again to restore.</p>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
              {pool.map((entry) => {
                const isRemoved = removedIds.has(entry.illustration_id);
                return (
                  <button
                    key={entry.illustration_id}
                    type="button"
                    onClick={() => toggleRemove(entry.illustration_id)}
                    className={`relative group rounded-lg overflow-hidden cursor-pointer transition-all ${
                      isRemoved ? "opacity-20 ring-2 ring-red-500" : "hover:ring-2 hover:ring-amber-500"
                    }`}
                  >
                    <img
                      src={cardUrl(entry.set_code, entry.collector_number, entry.image_version)}
                      alt={entry.name}
                      className="w-full"
                      style={{ aspectRatio: imageMode === "card" ? "488 / 680" : "626 / 457" }}
                    />
                    {isRemoved && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                    {imageMode !== "card" && !isRemoved && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[9px] text-white truncate">{entry.name}</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
