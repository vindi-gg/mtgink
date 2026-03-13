"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DeckView from "@/components/DeckView";
import type { DeckDetail } from "@/lib/types";

interface DeckResponse extends DeckDetail {
  is_owner: boolean;
}

export default function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const [deck, setDeck] = useState<DeckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  function loadDeck() {
    fetch(`/api/deck/${deckId}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Deck not found");
          throw new Error("Failed to load deck");
        }
        return res.json();
      })
      .then((data) => {
        setDeck(data);
        setEditName(data.name);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDeck();
  }, [deckId]);

  // Refetch when returning from remix or other pages
  useEffect(() => {
    function onFocus() { loadDeck(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [deckId]);

  async function handleRename() {
    if (!editName.trim() || !deck) return;
    const res = await fetch(`/api/deck/${deckId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    if (res.ok) {
      setDeck({ ...deck, name: editName });
      setEditing(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this deck? This cannot be undone.")) return;
    const res = await fetch(`/api/deck/${deckId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/deck");
    }
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-gray-500 text-sm">Loading deck...</p>
      </main>
    );
  }

  if (error || !deck) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-400 mb-4">{error || "Deck not found"}</p>
        <Link
          href="/deck"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Back to decks
        </Link>
      </main>
    );
  }

  const hasPurchases = deck.cards.some((c) => c.to_buy);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-3 py-1 text-lg font-bold text-white focus:outline-none focus:border-amber-500"
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
              />
              <button
                onClick={handleRename}
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-sm text-gray-500 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-white">{deck.name}</h1>
          )}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            {deck.format && (
              <span className="bg-gray-800 px-1.5 py-0.5 rounded">
                {deck.format}
              </span>
            )}
            {!deck.is_public && <span>Private</span>}
            {deck.source_url && (
              <a
                href={deck.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors"
              >
                Source
              </a>
            )}
          </div>
        </div>

        {deck.is_owner && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Rename
            </button>
            <button
              onClick={handleDelete}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Curate button */}
      {deck.cards.some((c) => c.illustrations.length >= 2) && (
        <Link
          href={`/deck/${deckId}/remix`}
          className="block mb-6 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg hover:border-amber-500/50 transition-colors text-center"
        >
          <span className="text-amber-400 font-bold text-sm">Deck Remix</span>
          <span className="text-gray-500 text-xs block mt-0.5">
            Remix the art in your deck
          </span>
        </Link>
      )}

      <DeckView
        data={deck}
        deckId={deckId}
        isOwner={deck.is_owner}
        hasPurchases={hasPurchases}
      />
    </main>
  );
}
