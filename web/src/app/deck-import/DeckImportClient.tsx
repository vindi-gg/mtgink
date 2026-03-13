"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function DeckImportClient() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const importingRef = useRef(false);

  async function doImport(text: string) {
    const trimmed = text.trim();
    if (!trimmed || importingRef.current) return;
    importingRef.current = true;

    setLoading(true);
    setError(null);
    setShowFallback(false);

    try {
      const isUrl = trimmed.startsWith("http");
      const res = await fetch("/api/deck/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isUrl ? { url: trimmed } : { decklist: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        if (data.fallback) {
          setShowFallback(true);
          setInput("");
        }
        return;
      }

      router.push(`/deck/${data.deckId}`);
    } catch {
      setError("Failed to import. Check the URL or decklist format.");
    } finally {
      setLoading(false);
      importingRef.current = false;
    }
  }

  return (
    <div>
      {showFallback && (
        <div className="mb-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-sm text-amber-400 font-medium mb-1">Paste your decklist instead</p>
          <p className="text-xs text-gray-400">
            In Moxfield, click <span className="text-gray-300">Export</span> → <span className="text-gray-300">Copy for Moxfield</span>, then paste below.
          </p>
        </div>
      )}

      {!showFallback && (
        <div className="mb-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg">
          <p className="text-sm text-gray-300">
            Paste a <span className="text-amber-400 font-medium">Moxfield link</span> or decklist below.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            In Moxfield, use <span className="text-gray-400">Export</span> → <span className="text-gray-400">Copy for Moxfield</span> to copy your decklist.
          </p>
        </div>
      )}

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onPaste={(e) => {
          // Auto-import on paste
          const text = e.clipboardData.getData("text");
          if (text.trim()) {
            setTimeout(() => doImport(text), 0);
          }
        }}
        placeholder={showFallback
          ? "Paste your exported decklist here:\n4 Lightning Bolt\n2 Counterspell\n1 Serra Angel"
          : "Paste a decklist here — auto-imports on paste"}
        rows={showFallback ? 10 : 3}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-base text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 resize-none"
      />

      {input.trim() && !loading && (
        <button
          onClick={() => doImport(input)}
          className="mt-3 px-6 py-2.5 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors"
        >
          Import
        </button>
      )}

      {loading && (
        <p className="text-sm text-gray-500 mt-3">Importing...</p>
      )}

      {error && (
        <p className="text-red-400 text-sm mt-3">{error}</p>
      )}
    </div>
  );
}
