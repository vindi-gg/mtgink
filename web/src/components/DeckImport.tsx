"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeckImportResponse } from "@/lib/types";

const PLACEHOLDER = `// Commander
1 Atraxa, Praetors' Voice

// Mainboard
1 Sol Ring
1 Swords to Plowshares
4 Lightning Bolt
2 Counterspell

// Sideboard
1 Rest in Peace`;

interface DeckImportProps {
  onImport: (result: DeckImportResponse & { meta?: { source_url?: string; name?: string; format?: string } }) => void;
  isAuthed?: boolean;
}

export default function DeckImport({ onImport, isAuthed }: DeckImportProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);

  // Save form state
  const [importResult, setImportResult] = useState<(DeckImportResponse & { meta?: { source_url?: string; name?: string; format?: string } }) | null>(null);
  const [deckName, setDeckName] = useState("");
  const [deckFormat, setDeckFormat] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  function isUrl(text: string): boolean {
    return /^https?:\/\//i.test(text.trim());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const body = isUrl(input) && !fallbackMode
        ? { url: input.trim() }
        : { decklist: input };

      const res = await fetch("/api/deck/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.fallback) {
          setFallbackMode(true);
          setError(data.error + " Paste the decklist below instead.");
          setInput("");
          return;
        }
        throw new Error(data.error || "Import failed");
      }

      const result = data as DeckImportResponse & { meta?: { source_url?: string; name?: string; format?: string } };

      if (isAuthed) {
        setImportResult(result);
        setDeckName(result.meta?.name || "");
        setDeckFormat(result.meta?.format || "");
      } else {
        onImport(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!importResult || !deckName.trim()) return;
    setSaving(true);

    try {
      const res = await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: deckName,
          format: deckFormat || undefined,
          is_public: isPublic,
          source_url: importResult.meta?.source_url || undefined,
          cards: importResult.cards.map((c) => ({
            quantity: c.quantity,
            name: c.card.name,
            section: c.section,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      const { id } = await res.json();
      router.push(`/deck/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  function handleSkipSave() {
    if (importResult) onImport(importResult);
  }

  // Show save form after successful import for authed users
  if (importResult && isAuthed) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-300 mb-3">
            Imported {importResult.stats.matched} cards.{" "}
            {importResult.stats.unmatched > 0 && (
              <span className="text-red-400">
                {importResult.stats.unmatched} unmatched.
              </span>
            )}
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Deck Name
              </label>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="My Deck"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">
                  Format
                </label>
                <select
                  value={deckFormat}
                  onChange={(e) => setDeckFormat(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">None</option>
                  <option value="commander">Commander</option>
                  <option value="standard">Standard</option>
                  <option value="modern">Modern</option>
                  <option value="pioneer">Pioneer</option>
                  <option value="legacy">Legacy</option>
                  <option value="vintage">Vintage</option>
                  <option value="pauper">Pauper</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="accent-amber-500"
                  />
                  Public
                </label>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || !deckName.trim()}
              className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save Deck"}
            </button>
            <button
              onClick={handleSkipSave}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Preview without saving
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="decklist"
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          {fallbackMode
            ? "Paste your decklist"
            : "Paste a Moxfield link or decklist"}
        </label>
        {!fallbackMode && (
          <p className="text-xs text-gray-500 mb-2">
            Paste a Moxfield deck URL, or export from any deck builder (Archidekt,
            MTGGoldfish, etc).
          </p>
        )}

        {isUrl(input) && !fallbackMode ? (
          <input
            id="decklist"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://www.moxfield.com/decks/..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"
          />
        ) : (
          <textarea
            id="decklist"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (fallbackMode && isUrl(e.target.value)) {
                // Don't switch back to URL mode if we're in fallback
              }
            }}
            placeholder={fallbackMode ? PLACEHOLDER : `https://www.moxfield.com/decks/...\n\nor paste a decklist:\n\n${PLACEHOLDER}`}
            rows={16}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono resize-y"
          />
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!isAuthed && (
        <p className="text-xs text-gray-500">
          Sign in to save decks and track your purchase list.
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !input.trim()}
        className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Importing..." : "Import Deck"}
      </button>
    </form>
  );
}
