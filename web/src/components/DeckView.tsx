"use client";

import { useState, useEffect } from "react";
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
  const artCount = entry.illustrations.length;

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

  // Find TCGPlayer ID for selected illustration
  const selectedIll = selectedIllId
    ? entry.illustrations.find((i) => i.illustration_id === selectedIllId)
    : entry.illustrations[0];

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setLocalExpanded(!localExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-900/50 transition-colors"
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

export default function DeckView({
  data,
  onImportNew,
  deckId,
  isOwner,
  hasPurchases,
}: DeckViewProps) {
  const [allExpanded, setAllExpanded] = useState(false);
  const [filter, setFilter] = useState<"all" | "changed">("all");

  const cards = data.cards as CardEntry[];
  const changedCount = cards.filter((c) => c.selected_illustration_id).length;

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
  const filteredCards = filter === "changed"
    ? cards.filter((c) => c.selected_illustration_id)
    : cards;
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
  const sections = new Map(
    [...sectionMap.entries()].sort(
      (a, b) => (SECTION_ORDER[a[0]] ?? 99) - (SECTION_ORDER[b[0]] ?? 99)
    )
  );

  const totalArts = cards.reduce(
    (sum, c) => sum + c.illustrations.length,
    0
  );

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

      {/* Filter tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            filter === "all"
              ? "bg-gray-800 text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("changed")}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            filter === "changed"
              ? "bg-gray-800 text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Changed{changedCount > 0 && ` (${changedCount})`}
        </button>
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
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
            {section}{" "}
            <span className="text-gray-600 font-normal">
              ({sectionCards.length})
            </span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {sectionCards.map((entry) => {
              const ill = entry.selected_illustration_id
                ? entry.illustrations.find((i) => i.illustration_id === entry.selected_illustration_id)
                : entry.illustrations[0];
              const displayIll = ill ?? entry.illustrations[0];
              const price = displayIll && "cheapest_price" in displayIll
                ? (displayIll as Illustration & { rating: ArtRating | null; cheapest_price?: number | null }).cheapest_price
                : null;
              const cardHref = deckId && entry.illustrations.length >= 2
                ? `/deck/${deckId}/remix?card=${entry.card.oracle_id}`
                : `/card/${entry.card.slug}`;
              return (
                <Link
                  key={entry.card.oracle_id}
                  href={cardHref}
                  className="group relative rounded-lg overflow-hidden"
                >
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
                  {/* Quantity badge */}
                  {entry.quantity > 1 && (
                    <div className="absolute top-1 left-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                      {entry.quantity}x
                    </div>
                  )}
                  {/* Art count badge */}
                  {entry.illustrations.length >= 2 && (
                    <div className="absolute top-1 right-1 bg-amber-500/90 text-black text-[10px] font-bold px-1 py-0.5 rounded">
                      {entry.illustrations.length} arts
                    </div>
                  )}
                  {/* Price overlay */}
                  {price != null && (
                    <div className="absolute bottom-1 right-1 bg-black/80 text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      ${price.toFixed(2)}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
