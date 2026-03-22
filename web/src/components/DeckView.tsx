"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { artCropUrl, normalCardUrl } from "@/lib/image-utils";
import CardFaceToggle from "./CardFaceToggle";
import MiniCompare from "./MiniCompare";
import type { DeckImportResponse, DeckCardWithArt, DeckCardDetail, Illustration, ArtRating } from "@/lib/types";

type CardEntry = (DeckCardWithArt | DeckCardDetail) & {
  selected_illustration_id?: string | null;
  to_buy?: boolean;
  back_face_url?: string | null;
};

interface DeckViewProps {
  data: DeckImportResponse | { cards: DeckCardDetail[]; unmatched: string[] };
  onImportNew?: () => void;
  deckId?: string;
  isOwner?: boolean;
  hasPurchases?: boolean;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("mtgink_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("mtgink_session_id", id);
  }
  return id;
}

function getOwned(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem("mtgink_owned") || "[]"));
  } catch { return new Set(); }
}

function setOwned(owned: Set<string>) {
  localStorage.setItem("mtgink_owned", JSON.stringify([...owned]));
}

function DeckCardRow({
  entry,
  forceExpanded,
  deckId,
  isOwner,
}: {
  entry: CardEntry;
  forceExpanded: boolean;
  deckId?: string;
  isOwner?: boolean;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = forceExpanded || localExpanded;
  const artCount = (entry as DeckCardDetail).illustration_count ?? entry.illustrations.length;

  const [selectedIllId, setSelectedIllId] = useState<string | null>(
    (entry as DeckCardDetail).selected_illustration_id ?? null
  );
  const [toBuy, setToBuy] = useState(
    !!(entry as DeckCardDetail).to_buy
  );

  const oracleId = entry.card.oracle_id;

  async function handleSelectArt(illustrationId: string) {
    if (!deckId || !isOwner) return;
    const newId = illustrationId === selectedIllId ? null : illustrationId;
    setSelectedIllId(newId);

    await fetch(`/api/deck/${deckId}/card/${oracleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selected_illustration_id: newId ?? "",
      }),
    });
  }

  async function handleToggleBuy() {
    if (!deckId || !isOwner) return;
    const newVal = !toBuy;
    setToBuy(newVal);

    await fetch(`/api/deck/${deckId}/card/${oracleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_buy: newVal }),
    });
  }

  // Find display illustration: user selection > original import > top-rated
  let selectedIll = selectedIllId
    ? entry.illustrations.find((i) => i.illustration_id === selectedIllId)
    : undefined;
  if (!selectedIll && (entry as DeckCardDetail).original_set_code) {
    const dc = entry as DeckCardDetail;
    selectedIll = entry.illustrations.find(
      (i) => i.set_code === dc.original_set_code && i.collector_number === dc.original_collector_number
    );
  }
  if (!selectedIll) selectedIll = entry.illustrations[0];

  return (
    <div className={`border border-gray-800 rounded-lg overflow-hidden ${artCount < 2 ? "opacity-50" : ""}`}>
      <button
        onClick={() => artCount >= 2 && setLocalExpanded(!localExpanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          artCount >= 2 ? "hover:bg-gray-900/50 cursor-pointer" : "cursor-default"
        }`}
      >
        {entry.illustrations[0] && (
          <img
            src={artCropUrl(
              (selectedIll ?? entry.illustrations[0]).set_code,
              (selectedIll ?? entry.illustrations[0]).collector_number,
              (selectedIll ?? entry.illustrations[0]).image_version
            )}
            alt=""
            className="w-12 h-9 object-cover rounded flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200 truncate">
              {entry.quantity > 1 && (
                <span className="text-gray-500 mr-1">{entry.quantity}x</span>
              )}
              {entry.card.name}
            </span>
            {artCount > 1 && (
              <span className="text-xs text-amber-400 flex-shrink-0">
                {artCount} arts
              </span>
            )}
            {selectedIllId && (
              <span className="text-xs text-green-400 flex-shrink-0">
                Selected
              </span>
            )}
            {toBuy && (
              <span className="text-xs text-blue-400 flex-shrink-0">
                To Buy
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {entry.card.type_line}
          </p>
        </div>
        {artCount >= 2 && (
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-4">
          <div className="flex items-center gap-3 mb-3 text-xs text-gray-400">
            <Link
              href={`/card/${entry.card.slug}`}
              className="hover:text-amber-400 transition-colors"
            >
              View card page
            </Link>
            {artCount >= 2 && (
              <Link
                href={`/showdown/remix?oracle_id=${oracleId}`}
                className="hover:text-amber-400 transition-colors"
              >
                Compare art
              </Link>
            )}
            {deckId && isOwner && (
              <button
                onClick={handleToggleBuy}
                className={`transition-colors ${
                  toBuy
                    ? "text-blue-400 hover:text-blue-300"
                    : "hover:text-amber-400"
                }`}
              >
                {toBuy ? "Remove from buy list" : "Add to buy list"}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {entry.illustrations.map((ill: Illustration & { rating: ArtRating | null }, i: number) => {
              const isSelected = ill.illustration_id === selectedIllId;
              return (
                <div
                  key={ill.illustration_id}
                  className={`bg-gray-900 rounded-lg overflow-hidden border-2 transition-colors ${
                    isSelected
                      ? "border-amber-500"
                      : "border-gray-800 hover:border-gray-700"
                  } ${deckId && isOwner ? "cursor-pointer" : ""}`}
                  onClick={() => handleSelectArt(ill.illustration_id)}
                >
                  <div className="relative">
                    <img
                      src={artCropUrl(ill.set_code, ill.collector_number, ill.image_version)}
                      alt={`Art by ${ill.artist}`}
                      className="w-full aspect-[4/3] object-cover"
                      loading="lazy"
                    />
                    <div className="absolute top-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-xs font-bold">
                      #{i + 1}
                    </div>
                    {ill.rating && (
                      <div className="absolute top-1 right-1 bg-amber-500/90 text-black px-1.5 py-0.5 rounded text-xs font-bold">
                        {Math.round(ill.rating.elo_rating)}
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute bottom-1 right-1 bg-amber-500 text-black px-1.5 py-0.5 rounded text-xs font-bold">
                        &#10003;
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-gray-300 truncate">
                      {ill.artist}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {ill.set_name}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* MiniCompare for cards with 2+ illustrations */}
          {artCount >= 2 && (
            <MiniCompare
              oracleId={oracleId}
              illustrations={entry.illustrations}
              sessionId={getSessionId()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ArtSelectModal({
  entry,
  selectedIllId,
  deckId,
  owned,
  onSelect,
  onToggleOwned,
  onClose,
}: {
  entry: CardEntry;
  selectedIllId: string | null;
  deckId: string;
  owned: Set<string>;
  onSelect: (oracleId: string, illustrationId: string | null) => void;
  onToggleOwned: (illustrationId: string) => void;
  onClose: () => void;
}) {
  const [allIlls, setAllIlls] = useState<(Illustration & { rating: ArtRating | null; cheapest_price?: number | null })[] | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Fetch full illustration list on mount
  useEffect(() => {
    fetch(`/api/card/${entry.card.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.illustrations) {
          const apiIlls = data.illustrations.map((ill: any) => ({
            illustration_id: ill.illustration_id,
            oracle_id: ill.oracle_id ?? entry.card.oracle_id,
            artist: ill.artist,
            set_code: ill.set_code,
            set_name: ill.set_name,
            collector_number: ill.collector_number,
            released_at: ill.released_at,
            image_version: ill.image_version,
            rating: ill.rating ?? null,
            cheapest_price: ill.cheapest_price ?? null,
          }));
          // Merge: keep existing items in place, append new ones
          const existingIds = new Set(entry.illustrations.map((i) => i.illustration_id));
          const extra = apiIlls.filter((i: any) => !existingIds.has(i.illustration_id));
          // Also update existing items with fresh price/rating data
          const apiMap = new Map(apiIlls.map((i: any) => [i.illustration_id, i]));
          const updated = entry.illustrations.map((i) => apiMap.get(i.illustration_id) ?? i);
          setAllIlls([...updated, ...extra] as any);
        }
      })
      .catch(() => {});
  }, [entry.card.slug, entry.card.oracle_id]);

  const displayIlls = allIlls ?? entry.illustrations;

  async function handleSelect(illustrationId: string) {
    // Clicking the already-selected card just closes
    if (illustrationId === selectedIllId) {
      onClose();
      return;
    }

    onSelect(entry.card.oracle_id, illustrationId);

    await fetch(`/api/deck/${deckId}/card/${entry.card.oracle_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_illustration_id: illustrationId }),
    });

    onClose();
  }

  // Sort: selected first, then by ELO
  const sortedIlls = [...displayIlls].sort((a, b) => {
    const asel = a.illustration_id === selectedIllId ? 0 : 1;
    const bsel = b.illustration_id === selectedIllId ? 0 : 1;
    if (asel !== bsel) return asel - bsel;
    return ((b as any).rating?.elo_rating ?? 1500) - ((a as any).rating?.elo_rating ?? 1500);
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">{entry.card.name}</h2>
            <p className="text-xs text-gray-500">{displayIlls.length} illustrations — tap to select</p>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors">
            Done
          </button>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {sortedIlls.map((ill: Illustration & { rating: ArtRating | null; cheapest_price?: number | null }) => {
            const isSelected = ill.illustration_id === selectedIllId;
            const isOwned = owned.has(ill.illustration_id);
            const price = ill.cheapest_price;
            return (
              <div key={ill.illustration_id} className="space-y-1.5">
                <button
                  onClick={() => handleSelect(ill.illustration_id)}
                  className={`w-full text-left rounded-lg overflow-hidden border-2 bg-gray-900 transition-colors cursor-pointer ${
                    isSelected ? "border-amber-500 ring-1 ring-amber-500/30" : "border-gray-800 hover:border-gray-600"
                  }`}
                >
                  <div className="relative">
                    <img
                      src={normalCardUrl(ill.set_code, ill.collector_number, ill.image_version)}
                      alt={`Art by ${ill.artist}`}
                      className="w-full rounded-lg"
                      loading="lazy"
                    />
                    {ill.rating && (
                      <div className="absolute top-1.5 right-1.5 bg-amber-500/90 text-black px-1.5 py-0.5 rounded text-xs font-bold">
                        {Math.round(ill.rating.elo_rating)}
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-1.5 left-1.5 bg-amber-500 text-black px-1.5 py-0.5 rounded text-xs font-bold">
                        &#10003; Selected
                      </div>
                    )}
                    {price != null && (
                      <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-green-400 text-xs font-bold px-1.5 py-0.5 rounded">
                        ${price.toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 py-2 bg-gray-900">
                    <p className="text-xs font-medium text-gray-300 truncate">{ill.artist}</p>
                    <p className="text-xs text-gray-500 truncate">{ill.set_name}</p>
                  </div>
                </button>
                <button
                  onClick={() => onToggleOwned(ill.illustration_id)}
                  className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isOwned
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/25"
                      : "bg-gray-900 text-gray-600 hover:text-gray-400 border border-gray-800"
                  }`}
                >
                  {isOwned ? "\u2713 Owned" : "I own this"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DeckView({
  data,
  onImportNew,
  deckId,
  isOwner,
  hasPurchases,
}: DeckViewProps) {
  const [allExpanded, setAllExpanded] = useState(false);
  const [filter, setFilter] = useState<"all" | "changed">("all");
  const [gridCols, setGridCols] = useState(4);
  const [modalCard, setModalCard] = useState<CardEntry | null>(null);
  const [localSelections, setLocalSelections] = useState<Record<string, string | null>>({});
  const [ownedIlls, setOwnedIlls] = useState(() => getOwned());

  const handleToggleOwned = useCallback((illustrationId: string) => {
    setOwnedIlls((prev) => {
      const next = new Set(prev);
      if (next.has(illustrationId)) next.delete(illustrationId);
      else next.add(illustrationId);
      setOwned(next);
      return next;
    });
  }, []);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [hideOneArt, setHideOneArt] = useState(() => {
    if (typeof window === "undefined" || !deckId) return false;
    return localStorage.getItem(`deck_hideOneArt_${deckId}`) === "true";
  });

  useEffect(() => {
    if (deckId) localStorage.setItem(`deck_hideOneArt_${deckId}`, String(hideOneArt));
  }, [hideOneArt, deckId]);

  const handleModalSelect = useCallback((oracleId: string, illustrationId: string | null) => {
    setLocalSelections((prev) => ({ ...prev, [oracleId]: illustrationId }));
  }, []);

  const gridClass =
    gridCols === 3
      ? "grid grid-cols-2 sm:grid-cols-3 gap-3"
      : gridCols === 5
        ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3"
        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3";

  const cards = data.cards as CardEntry[];
  const getEffectiveSelId = (c: CardEntry) =>
    c.card.oracle_id in localSelections ? localSelections[c.card.oracle_id] : c.selected_illustration_id;
  const changedCount = cards.filter((c) => getEffectiveSelId(c) != null).length;

  const SECTION_ORDER: Record<string, number> = {
    Commander: 0,
    Companion: 1,
    Creatures: 2,
    Planeswalkers: 3,
    Instants: 4,
    Sorceries: 5,
    Enchantments: 6,
    Artifacts: 7,
    Battles: 8,
    Lands: 9,
    Mainboard: 10,
    Sideboard: 11,
    Other: 12,
  };

  // Group cards by section, deriving type-based sections for Mainboard cards
  const preFiltered = filter === "changed"
    ? cards.filter((c) => getEffectiveSelId(c) != null)
    : cards;
  const filteredCards = hideOneArt
    ? preFiltered.filter((c) => ((c as DeckCardDetail).illustration_count ?? c.illustrations.length) >= 2)
    : preFiltered;
  const sectionMap = new Map<string, CardEntry[]>();
  for (const card of filteredCards) {
    let section = card.section;
    if (section === "Mainboard") {
      const t = (card.card.type_line ?? "").toLowerCase();
      if (t.includes("creature")) section = "Creatures";
      else if (t.includes("planeswalker")) section = "Planeswalkers";
      else if (t.includes("battle")) section = "Battles";
      else if (t.includes("instant")) section = "Instants";
      else if (t.includes("sorcery")) section = "Sorceries";
      else if (t.includes("enchantment")) section = "Enchantments";
      else if (t.includes("artifact")) section = "Artifacts";
      else if (t.includes("land")) section = "Lands";
    }
    if (!sectionMap.has(section)) sectionMap.set(section, []);
    sectionMap.get(section)!.push(card);
  }
  // Sort cards within each section alphabetically by name
  for (const [, sectionCards] of sectionMap) {
    sectionCards.sort((a, b) => a.card.name.localeCompare(b.card.name));
  }
  const sections = new Map(
    [...sectionMap.entries()].sort(
      (a, b) => (SECTION_ORDER[a[0]] ?? 99) - (SECTION_ORDER[b[0]] ?? 99)
    )
  );

  const totalArts = cards.reduce(
    (sum, c) => sum + ((c as DeckCardDetail).illustration_count ?? c.illustrations.length),
    0
  );

  // Calculate total price and mass entry URL for changed cards
  const ownedSet = ownedIlls;
  const changedCards = cards.filter((c) => getEffectiveSelId(c) != null);
  const needToBuy = changedCards.filter((c) => {
    const selId = getEffectiveSelId(c);
    return selId && !ownedSet.has(selId);
  });
  const changedPriceTotal = needToBuy.reduce((sum, c) => {
    const selId = getEffectiveSelId(c);
    const ill = c.illustrations.find((i) => i.illustration_id === selId);
    const price = ill && "cheapest_price" in ill
      ? (ill as Illustration & { cheapest_price?: number | null }).cheapest_price
      : null;
    return sum + (price ?? 0) * c.quantity;
  }, 0);

  const tcgMassEntryUrl = needToBuy.length > 0
    ? "https://www.tcgplayer.com/massentry?productLine=magic&c=" +
      encodeURIComponent(
        needToBuy.map((c) => `${c.quantity} ${c.card.name}`).join("||")
      )
    : null;

  const unmatchedNames =
    "stats" in data
      ? (data as DeckImportResponse).unmatched.map((e) => e.name)
      : (data.unmatched as string[]);

  const matchedCount =
    "stats" in data ? (data as DeckImportResponse).stats.matched : cards.length;
  const unmatchedCount =
    "stats" in data
      ? (data as DeckImportResponse).stats.unmatched
      : (data.unmatched as string[]).length;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-gray-300">
          <span className="font-bold text-white">{matchedCount}</span>{" "}
          cards matched
        </span>
        <span className="text-gray-500">
          {totalArts} unique illustrations
        </span>
        {unmatchedCount > 0 && (
          <span className="text-red-400">{unmatchedCount} unmatched</span>
        )}
        <div className="flex-1" />
        {hasPurchases && (
          <Link
            href="/deck/purchases"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Purchase List
          </Link>
        )}
        <button
          onClick={() => setAllExpanded(!allExpanded)}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
        {onImportNew && (
          <button
            onClick={onImportNew}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Import new deck
          </button>
        )}
      </div>

      {/* Filter tabs + grid selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-gray-800 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("changed")}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              filter === "changed"
                ? "bg-gray-800 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Changed{changedCount > 0 && ` (${changedCount})`}
          </button>
          {filter === "changed" && changedCount > 0 && (
            <>
              {changedPriceTotal > 0 && (
                <span className="text-sm text-green-400 font-medium">
                  ${changedPriceTotal.toFixed(2)}
                </span>
              )}
              {tcgMassEntryUrl && (
                <a
                  href={tcgMassEntryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors"
                >
                  Buy on TCGPlayer
                </a>
              )}
            </>
          )}
        </div>
        {/* Multi-art toggle */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-gray-500">Multi-art only</span>
            <button
              onClick={() => setHideOneArt(!hideOneArt)}
              className={`relative w-8 h-[18px] rounded-full transition-colors ${hideOneArt ? "bg-amber-500" : "bg-gray-700"}`}
            >
              <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${hideOneArt ? "left-[16px]" : "left-[2px]"}`} />
            </button>
          </label>
        </div>
        {/* Grid size selector */}
        <div className="hidden md:flex items-center gap-1">
          {[3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setGridCols(n)}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                gridCols === n ? "text-white" : "text-gray-600 hover:text-gray-400"
              }`}
              title={`${n} columns`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                {Array.from({ length: n * n }, (_, i) => {
                  const gap = 1;
                  const cellSize = (16 - gap * (n - 1)) / n;
                  const col = i % n;
                  const row = Math.floor(i / n);
                  return (
                    <rect
                      key={i}
                      x={col * (cellSize + gap)}
                      y={row * (cellSize + gap)}
                      width={cellSize}
                      height={cellSize}
                      rx={1}
                    />
                  );
                })}
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Unmatched warning */}
      {unmatchedNames.length > 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
          <p className="text-sm font-medium text-red-400 mb-1">
            Unmatched cards
          </p>
          <p className="text-xs text-gray-400">
            {unmatchedNames.join(", ")}
          </p>
        </div>
      )}

      {/* Sections */}
      {Array.from(sections.entries()).map(([section, sectionCards]) => (
        <div key={section}>
          <button
            onClick={() => setCollapsedSections((prev) => {
              const next = new Set(prev);
              if (next.has(section)) next.delete(section);
              else next.add(section);
              return next;
            })}
            className="flex items-center gap-2 mb-3 cursor-pointer group"
          >
            <svg
              className={`w-3 h-3 text-gray-600 transition-transform ${collapsedSections.has(section) ? "-rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider group-hover:text-gray-300 transition-colors">
              {section}{" "}
              <span className="text-gray-600 font-normal">
                ({sectionCards.length})
              </span>
            </h3>
          </button>
          {!collapsedSections.has(section) && <div className={gridClass}>
            {sectionCards.map((entry) => {
              // Priority: local selection > server selection > original import printing > top-rated
              const effectiveSelId = entry.card.oracle_id in localSelections
                ? localSelections[entry.card.oracle_id]
                : entry.selected_illustration_id;
              let ill = effectiveSelId
                ? entry.illustrations.find((i) => i.illustration_id === effectiveSelId)
                : undefined;
              if (!ill && entry.original_set_code) {
                ill = entry.illustrations.find(
                  (i) => i.set_code === entry.original_set_code && i.collector_number === entry.original_collector_number
                );
              }
              const displayIll = ill ?? entry.illustrations[0];
              const price = displayIll && "cheapest_price" in displayIll
                ? (displayIll as Illustration & { rating: ArtRating | null; cheapest_price?: number | null }).cheapest_price
                : null;
              const entryArtCount = (entry as DeckCardDetail).illustration_count ?? entry.illustrations.length;
              const canSelectArt = deckId && isOwner && entryArtCount >= 2;

              const cardContent = (
                <>
                  {displayIll && entry.back_face_url ? (
                    <CardFaceToggle
                      frontSrc={normalCardUrl(displayIll.set_code, displayIll.collector_number, displayIll.image_version)}
                      backSrc={entry.back_face_url}
                      alt={entry.card.name}
                    />
                  ) : displayIll ? (
                    <img
                      src={normalCardUrl(displayIll.set_code, displayIll.collector_number, displayIll.image_version)}
                      alt={entry.card.name}
                      className="w-full rounded-lg"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-[488/680] bg-gray-800 rounded-lg flex items-center justify-center">
                      <span className="text-xs text-gray-500">{entry.card.name}</span>
                    </div>
                  )}
                  {entry.quantity > 1 && (
                    <div className="absolute top-1 left-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                      {entry.quantity}x
                    </div>
                  )}
                  {entryArtCount >= 2 && (
                    <div className="absolute top-1 right-1 bg-amber-500/90 text-black text-[10px] font-bold px-1 py-0.5 rounded">
                      {entryArtCount} arts
                    </div>
                  )}
                  {effectiveSelId && !ownedSet.has(effectiveSelId) && (
                    <div className="absolute bottom-1 left-1 bg-amber-500 text-black text-[10px] font-bold px-1 py-0.5 rounded">
                      &#10003;
                    </div>
                  )}
                  {effectiveSelId && ownedSet.has(effectiveSelId) && (
                    <div className="absolute bottom-1 left-1 bg-blue-500 text-white text-[10px] font-bold px-1 py-0.5 rounded">
                      Owned
                    </div>
                  )}
                  {effectiveSelId && ownedSet.has(effectiveSelId) && (
                    <div className="absolute inset-0 bg-black/40 rounded-lg" />
                  )}
                  {price != null && (
                    <div className="absolute bottom-1 right-1 bg-black/80 text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      ${price.toFixed(2)}
                    </div>
                  )}
                </>
              );

              return canSelectArt ? (
                <button
                  key={entry.card.oracle_id}
                  onClick={() => setModalCard(entry)}
                  className={`group relative rounded-lg overflow-hidden text-left cursor-pointer ${entryArtCount < 2 ? "opacity-50" : ""}`}
                >
                  {cardContent}
                </button>
              ) : (
                <Link
                  key={entry.card.oracle_id}
                  href={`/card/${entry.card.slug}`}
                  className={`group relative rounded-lg overflow-hidden ${entryArtCount < 2 ? "opacity-50" : ""}`}
                >
                  {cardContent}
                </Link>
              );
            })}
          </div>}
        </div>
      ))}

      {/* Art select modal */}
      {modalCard && deckId && (
        <ArtSelectModal
          entry={modalCard}
          selectedIllId={
            modalCard.card.oracle_id in localSelections
              ? localSelections[modalCard.card.oracle_id]
              : modalCard.selected_illustration_id ?? null
          }
          deckId={deckId}
          owned={ownedIlls}
          onSelect={handleModalSelect}
          onToggleOwned={handleToggleOwned}
          onClose={() => setModalCard(null)}
        />
      )}
    </div>
  );
}
