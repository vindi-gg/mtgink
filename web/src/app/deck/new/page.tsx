"use client";

import { useState, useEffect } from "react";
import DeckImport from "@/components/DeckImport";
import DeckView from "@/components/DeckView";
import { createClient } from "@/lib/supabase/client";
import type { DeckImportResponse } from "@/lib/types";

export default function NewDeckPage() {
  const [data, setData] = useState<DeckImportResponse | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        setIsAuthed(!!user);
        setLoaded(true);
      });
    } else {
      setLoaded(true);
    }
  }, [supabase]);

  if (!loaded) return null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Import Deck</h1>
      <p className="text-gray-400 text-sm mb-6">
        Paste a Moxfield link or decklist to browse art versions for every card.
      </p>

      {data ? (
        <DeckView
          data={data}
          onImportNew={() => setData(null)}
        />
      ) : (
        <DeckImport
          onImport={(result) => setData(result)}
          isAuthed={isAuthed}
        />
      )}
    </main>
  );
}
