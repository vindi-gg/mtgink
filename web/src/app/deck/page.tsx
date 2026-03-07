"use client";

import { useState, useEffect } from "react";
import DeckImport from "@/components/DeckImport";
import DeckView from "@/components/DeckView";
import DeckList from "@/components/DeckList";
import { createClient } from "@/lib/supabase/client";
import type { DeckImportResponse } from "@/lib/types";

const STORAGE_KEY = "mtgink_deck";

export default function DeckPage() {
  const [data, setData] = useState<DeckImportResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Check auth
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        setIsAuthed(!!user);
        setLoaded(true);
      });
    } else {
      // No auth configured — load localStorage fallback
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setData(JSON.parse(saved));
      } catch {
        // ignore
      }
      setLoaded(true);
    }
  }, [supabase]);

  function handleImport(result: DeckImportResponse) {
    setData(result);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch {
      // ignore quota errors
    }
  }

  function handleImportNew() {
    setData(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  if (!loaded) return null;

  // Authed users see their deck list
  if (isAuthed) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          Deck Art Explorer
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Import decks and browse all available art versions for every card.
        </p>
        <DeckList />
      </main>
    );
  }

  // Non-authed: localStorage fallback
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Deck Art Explorer</h1>
      <p className="text-gray-400 text-sm mb-6">
        Import your deck to browse all available art versions for every card,
        ranked by community votes.
      </p>

      {data ? (
        <DeckView data={data} onImportNew={handleImportNew} />
      ) : (
        <DeckImport onImport={handleImport} isAuthed={false} />
      )}
    </main>
  );
}
