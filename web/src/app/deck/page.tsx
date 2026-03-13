"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import DeckImport from "@/components/DeckImport";
import DeckList from "@/components/DeckList";
import { createClient } from "@/lib/supabase/client";
import type { DeckImportResponse } from "@/lib/types";

interface AnonDeck {
  id: string;
  name: string;
}

export default function DeckPage() {
  const [loaded, setLoaded] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [anonDecks, setAnonDecks] = useState<AnonDeck[]>([]);
  const supabase = createClient();

  useEffect(() => {
    // Load anon decks from localStorage
    try {
      const stored = JSON.parse(localStorage.getItem("mtgink_anon_decks") || "[]") as AnonDeck[];
      setAnonDecks(stored);
    } catch { /* ignore */ }

    // Check auth
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        setIsAuthed(!!user);
        setLoaded(true);
      });
    } else {
      setLoaded(true);
    }
  }, [supabase]);

  function handleImport() {
    // no-op — DeckImport now saves to DB and redirects
  }

  if (!loaded) return null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Deck Art Explorer</h1>
      <p className="text-gray-400 text-sm mb-6">
        Import decks and browse all available art versions for every card.
      </p>

      {isAuthed ? (
        <DeckList />
      ) : (
        <>
          {anonDecks.length > 0 && (
            <div className="mb-6 space-y-2">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                Your Decks
              </h2>
              {anonDecks.map((deck) => (
                <Link
                  key={deck.id}
                  href={`/deck/${deck.id}`}
                  className="block px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
                >
                  <span className="text-white font-medium">{deck.name}</span>
                </Link>
              ))}
              <p className="text-xs text-gray-600 mt-2">
                Sign in to keep your decks across devices.
              </p>
            </div>
          )}

          {!isAuthed && anonDecks.length === 0 && (
            <p className="text-xs text-gray-500 mb-4">
              Sign in to save decks permanently. Imported decks are stored in your browser.
            </p>
          )}

          <DeckImport onImport={handleImport} isAuthed={isAuthed} />
        </>
      )}
    </main>
  );
}
