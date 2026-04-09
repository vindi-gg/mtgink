"use client";

import { useState, useEffect } from "react";
import BracketFillView from "@/components/BracketFillView";
import type { BracketCard } from "@/lib/types";

const STORAGE_KEY = "mtgink_bracket_cards";
const BRACKET_SIZE = 8;

export default function BracketPageClient() {
  const [cards, setCards] = useState<BracketCard[] | null>(null);

  useEffect(() => {
    // Check localStorage first — must match expected size
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BracketCard[];
        if (parsed.length === BRACKET_SIZE) {
          setCards(parsed);
          return;
        }
      } catch { /* ignore */ }
    }

    // Fetch fresh cards
    fetch(`/api/bracket?count=${BRACKET_SIZE}`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.cards as BracketCard[];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
        setCards(c);
      })
      .catch(console.error);
  }, []);

  if (!cards) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-2 text-amber-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading bracket...</span>
        </div>
      </div>
    );
  }

  return <BracketFillView cards={cards} slug="test" />;
}
