"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { OracleCard } from "@/lib/types";

type SearchResult = OracleCard & { matched_flavor_name?: string | null };

export default function CardSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}`
        );
        const data = await res.json();
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a card (e.g. Lightning Bolt)..."
        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-lg"
        autoFocus
      />

      {loading && (
        <p className="text-gray-500 text-sm mt-4">Searching...</p>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-4 grid gap-2">
          {results.map((card) => (
            <Link
              key={card.oracle_id}
              href={`/card/${card.slug}`}
              className="flex items-center justify-between px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
            >
              <div>
                {card.matched_flavor_name ? (
                  <>
                    <span className="text-white font-medium">{card.matched_flavor_name}</span>
                    <span className="text-gray-500 text-sm ml-2">{card.name}</span>
                  </>
                ) : (
                  <>
                    <span className="text-white font-medium">{card.name}</span>
                    {card.type_line && (
                      <span className="text-gray-500 text-sm ml-2">
                        {card.type_line}
                      </span>
                    )}
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-gray-500 text-sm mt-4">
          No cards found with multiple art versions.
        </p>
      )}
    </div>
  );
}
