"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { DeckSummary } from "@/lib/types";

export default function DeckList() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deck")
      .then((res) => res.json())
      .then((data) => setDecks(data.decks ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(deckId: string) {
    if (!confirm("Delete this deck?")) return;
    const res = await fetch(`/api/deck/${deckId}`, { method: "DELETE" });
    if (res.ok) {
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
    }
  }

  if (loading) {
    return (
      <div className="text-gray-500 text-sm py-8 text-center">
        Loading decks...
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">No saved decks yet.</p>
        <Link
          href="/deck/new"
          className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors inline-block"
        >
          Import Your First Deck
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Your Decks</h2>
        <Link
          href="/deck/new"
          className="px-4 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors"
        >
          Import New Deck
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {decks.map((deck) => (
          <div
            key={deck.id}
            className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
          >
            <Link href={`/deck/${deck.id}`} className="block">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-white">{deck.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    {deck.format && (
                      <span className="bg-gray-800 px-1.5 py-0.5 rounded">
                        {deck.format}
                      </span>
                    )}
                    <span>{deck.unique_cards} cards</span>
                    <span>
                      {new Date(deck.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {!deck.is_public && (
                  <span className="text-xs text-gray-600">Private</span>
                )}
              </div>
            </Link>
            <button
              onClick={() => handleDelete(deck.id)}
              className="mt-2 text-xs text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
