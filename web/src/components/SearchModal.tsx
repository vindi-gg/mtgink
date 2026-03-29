"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface SearchResult {
  oracle_id: string;
  name: string;
  slug: string;
  type_line: string | null;
  illustration_count?: number;
  matched_flavor_name?: string | null;
}

export default function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    }
  }, [open]);

  // Debounced search
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
        setResults(data.results ?? []);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigate = useCallback(
    (slug: string) => {
      onClose();
      router.push(`/card/${slug}`);
    },
    [onClose, router]
  );

  const listRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => {
          const next = Math.min(i + 1, results.length - 1);
          listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => {
          const next = Math.max(i - 1, 0);
          listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        navigate(results[selectedIndex].slug);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [results, selectedIndex, navigate, onClose]
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative max-w-lg mx-auto mt-16 sm:mt-[15vh] px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-gray-800">
            <svg
              className="w-5 h-5 text-gray-500 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search cards..."
              autoFocus
              enterKeyHint="search"
              className="flex-1 py-3.5 bg-transparent text-white placeholder-gray-500 focus:outline-none text-base"
            />
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs text-gray-500 bg-gray-800 border border-gray-700 rounded">
              ESC
            </kbd>
          </div>

          {/* Results */}
          {(results.length > 0 || loading || query.trim().length >= 2) && (
            <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
              {loading && results.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500">Searching...</p>
              )}

              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500">
                  No cards found with multiple art versions.
                </p>
              )}

              {results.map((card, i) => (
                <button
                  key={card.oracle_id}
                  onClick={() => navigate(card.slug)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    i === selectedIndex
                      ? "bg-gray-800"
                      : "hover:bg-gray-800/50"
                  }`}
                >
                  <div className="min-w-0">
                    {card.matched_flavor_name ? (
                      <>
                        <span className="text-white text-sm font-medium">
                          {card.matched_flavor_name}
                        </span>
                        <span className="text-gray-500 text-xs ml-2">
                          {card.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-white text-sm font-medium">
                          {card.name}
                        </span>
                        {card.type_line && (
                          <span className="text-gray-500 text-xs ml-2 hidden sm:inline">
                            {card.type_line}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {card.illustration_count && card.illustration_count > 1 && (
                    <span className="text-xs text-gray-600 flex-shrink-0">
                      {card.illustration_count} arts
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
