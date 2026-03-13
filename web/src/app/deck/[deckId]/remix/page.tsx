"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { normalCardUrl } from "@/lib/image-utils";
import CardFaceToggle from "@/components/CardFaceToggle";
import type { DeckDetail, DeckCardDetail, Illustration, ArtRating } from "@/lib/types";

type IllWithRating = Illustration & { rating: ArtRating | null; cheapest_price?: number | null };

interface RemixCard {
  card: DeckCardDetail;
  illustrations: IllWithRating[];
}

const INITIAL_SHOW = 16;

/** Find the default illustration: user selection > original import printing > top-rated */
function defaultIllId(card: RemixCard): string | null {
  if (card.card.selected_illustration_id) return card.card.selected_illustration_id;
  if (card.card.original_set_code) {
    const match = card.illustrations.find(
      (i) => i.set_code === card.card.original_set_code && i.collector_number === card.card.original_collector_number
    );
    if (match) return match.illustration_id;
  }
  return card.illustrations[0]?.illustration_id ?? null;
}

const SECTION_ORDER: Record<string, number> = {
  Commander: 0, Companion: 1, Creatures: 2, Planeswalkers: 3,
  Instants: 4, Sorceries: 5, Enchantments: 6, Artifacts: 7,
  Battles: 8, Lands: 9, Mainboard: 10, Sideboard: 11, Other: 12,
};

function derivedSection(section: string, typeLine: string): string {
  if (section !== "Mainboard") return section;
  const t = typeLine.toLowerCase();
  if (t.includes("creature")) return "Creatures";
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("battle")) return "Battles";
  if (t.includes("instant")) return "Instants";
  if (t.includes("sorcery")) return "Sorceries";
  if (t.includes("enchantment")) return "Enchantments";
  if (t.includes("artifact")) return "Artifacts";
  if (t.includes("land")) return "Lands";
  return section;
}

export default function DeckRemixPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const startCard = searchParams.get("card");

  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [remixCards, setRemixCards] = useState<RemixCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [done, setDone] = useState(false);
  const [changedCount, setChangedCount] = useState(0);

  useEffect(() => {
    fetch(`/api/deck/${deckId}`)
      .then((r) => r.json())
      .then((data: DeckDetail) => {
        setDeck(data);
        const cards: RemixCard[] = data.cards
          .filter((c) => c.illustrations.length >= 2)
          .map((c) => ({
            card: c,
            illustrations: [...c.illustrations].sort(
              (a, b) => (b.rating?.elo_rating ?? 0) - (a.rating?.elo_rating ?? 0)
            ),
          }))
          .sort((a, b) => {
            const secA = derivedSection(a.card.section, a.card.card.type_line ?? "");
            const secB = derivedSection(b.card.section, b.card.card.type_line ?? "");
            return (SECTION_ORDER[secA] ?? 99) - (SECTION_ORDER[secB] ?? 99);
          });
        setRemixCards(cards);
        if (cards.length > 0) {
          // Jump to specific card if query param provided
          let startIdx = 0;
          if (startCard) {
            const idx = cards.findIndex((c) => c.card.card.oracle_id === startCard);
            if (idx >= 0) startIdx = idx;
          }
          setCardIndex(startIdx);
          setSelected(defaultIllId(cards[startIdx]));
        } else {
          setDone(true);
        }
      })
      .finally(() => setLoading(false));
  }, [deckId]);

  // Scroll to top when card changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [cardIndex]);

  const saveSelection = useCallback(async () => {
    if (!selected || !remixCards[cardIndex]) return;
    const card = remixCards[cardIndex];
    // Only save if the user actually changed from the default
    if (selected === defaultIllId(card)) return;
    await fetch(`/api/deck/${deckId}/card/${card.card.card.oracle_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_illustration_id: selected }),
    });
  }, [selected, remixCards, cardIndex, deckId]);

  const saveAndAdvance = useCallback(async () => {
    if (!selected) return;
    const card = remixCards[cardIndex];
    if (selected !== defaultIllId(card)) {
      setChangedCount((c) => c + 1);
    }

    await saveSelection();

    const nextCard = cardIndex + 1;
    if (nextCard < remixCards.length) {
      setCardIndex(nextCard);
      setShowAll(false);
      const next = remixCards[nextCard];
      setSelected(defaultIllId(next));
    } else {
      setDone(true);
    }
  }, [selected, remixCards, cardIndex, deckId, saveSelection]);

  const skipCard = useCallback(() => {
    const nextCard = cardIndex + 1;
    if (nextCard < remixCards.length) {
      setCardIndex(nextCard);
      setShowAll(false);
      const next = remixCards[nextCard];
      setSelected(defaultIllId(next));
    } else {
      setDone(true);
    }
  }, [cardIndex, remixCards]);

  const goBack = useCallback(() => {
    if (cardIndex > 0) {
      const prev = cardIndex - 1;
      setCardIndex(prev);
      setShowAll(false);
      const prevCard = remixCards[prev];
      setSelected(defaultIllId(prevCard));
    }
  }, [cardIndex, remixCards]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (done) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") goBack();
      else if (e.key === "s" || e.key === "S") skipCard();
      else if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") saveAndAdvance();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [done, goBack, skipCard, saveAndAdvance]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-500">Loading deck...</p>
      </main>
    );
  }

  if (done) {
    const totalRemixed = remixCards.length;
    const skipped = (deck?.cards.length ?? 0) - totalRemixed;
    return (
      <main className="min-h-screen bg-gray-950 text-white px-4 py-10">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold text-amber-400 mb-2">Deck Remix complete</h1>
          <p className="text-gray-400 mb-1">
            {totalRemixed > 0 ? (
              <>
                Reviewed <span className="text-white font-bold">{totalRemixed}</span> card{totalRemixed !== 1 ? "s" : ""}
                {changedCount > 0 && (
                  <>, changed <span className="text-amber-400 font-bold">{changedCount}</span></>
                )}
              </>
            ) : (
              "No cards with multiple art versions"
            )}
          </p>
          {skipped > 0 && (
            <p className="text-gray-600 text-sm">
              {skipped} card{skipped !== 1 ? "s" : ""} skipped (single art)
            </p>
          )}
          <button
            onClick={() => router.push(`/deck/${deckId}`)}
            className="mt-6 px-6 py-2.5 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors"
          >
            View Deck
          </button>
        </div>
      </main>
    );
  }

  const card = remixCards[cardIndex];
  const allIlls = card.illustrations;
  const hasMore = allIlls.length > INITIAL_SHOW;
  const visibleIlls = showAll ? allIlls : allIlls.slice(0, INITIAL_SHOW);
  const deckProgress = (cardIndex + 1) / remixCards.length;

  return (
    <div className="px-3 md:px-4 py-3 md:py-4 max-w-5xl mx-auto">
      {/* Deck progress */}
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
        <span>Card {cardIndex + 1} of {remixCards.length}</span>
        <button
          onClick={async () => {
            await saveSelection();
            router.push(`/deck/${deckId}`);
          }}
          className="text-gray-600 hover:text-gray-400 transition-colors"
        >
          Exit
        </button>
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-300"
          style={{ width: `${deckProgress * 100}%` }}
        />
      </div>

      {/* Card info */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-white">
            <a href={`/card/${card.card.card.slug}`} className="text-amber-400 hover:text-amber-300">
              {card.card.card.name}
            </a>
          </h2>
          <p className="text-xs text-gray-500">
            {card.card.card.type_line}
            <span className="text-gray-700 ml-2">{allIlls.length} art{allIlls.length !== 1 ? "s" : ""}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cardIndex > 0 && (
            <button
              onClick={goBack}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
              title="Back (A)"
            >
              Back
            </button>
          )}
          <button
            onClick={skipCard}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
            title="Skip (S)"
          >
            Skip
          </button>
          <button
            onClick={saveAndAdvance}
            className="px-4 py-1.5 text-sm font-bold bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 transition-colors"
            title="Next (D)"
          >
            Next
          </button>
        </div>
      </div>

      {/* Art grid — full card images */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
        {visibleIlls.map((ill) => {
          const isSelected = ill.illustration_id === selected;
          return (
            <button
              key={ill.illustration_id}
              onClick={() => setSelected(ill.illustration_id)}
              className={`relative rounded-lg overflow-hidden text-left transition-all ${
                isSelected
                  ? "ring-3 ring-amber-500 scale-[1.02]"
                  : "ring-1 ring-gray-800 hover:ring-gray-600 opacity-80 hover:opacity-100"
              }`}
            >
              {card.card.back_face_url ? (
                <CardFaceToggle
                  frontSrc={normalCardUrl(ill.set_code, ill.collector_number, ill.image_version)}
                  backSrc={card.card.back_face_url}
                  alt={`${ill.artist} — ${ill.set_name}`}
                />
              ) : (
                <img
                  src={normalCardUrl(ill.set_code, ill.collector_number, ill.image_version)}
                  alt={`${ill.artist} — ${ill.set_name}`}
                  className="w-full rounded-lg"
                  loading="lazy"
                />
              )}
              {/* Price badge — prominent */}
              {ill.cheapest_price != null && (
                <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-green-400 text-xs font-bold px-2 py-1 rounded-md">
                  ${ill.cheapest_price.toFixed(2)}
                </div>
              )}
              {/* ELO badge */}
              {ill.rating && (
                <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm text-amber-400 text-xs font-bold px-1.5 py-0.5 rounded-md">
                  {Math.round(ill.rating.elo_rating)}
                </div>
              )}
              {/* Set code */}
              <div className="absolute bottom-2 left-2 bg-black/70 text-[10px] text-gray-300 px-1.5 py-0.5 rounded">
                {ill.set_code.toUpperCase()} · {ill.artist}
              </div>
              {/* Selected check */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <svg className="w-7 h-7 text-amber-400 drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Show more */}
      {hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 w-full py-2 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
        >
          Show all {allIlls.length} arts
        </button>
      )}

      {/* Bottom next button for scrolled pages */}
      {visibleIlls.length > 9 && (
        <div className="sticky bottom-4 mt-4 flex justify-center">
          <button
            onClick={saveAndAdvance}
            className="px-6 py-2.5 text-sm font-bold bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 transition-colors shadow-lg shadow-black/50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
