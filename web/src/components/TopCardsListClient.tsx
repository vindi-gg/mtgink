"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { TopCard } from "@/lib/queries";
import { artCropUrl } from "@/lib/image-utils";
import ClientPagination from "@/components/ClientPagination";

type SortOption = "popular" | "prints";
const PER_PAGE = 50;

export default function TopCardsListClient({
  popular,
  prints,
  total,
}: {
  popular: TopCard[];
  prints: TopCard[];
  total: number;
}) {
  const [sort, setSort] = useState<SortOption>("popular");
  const [page, setPage] = useState(1);

  const cards = sort === "prints" ? prints : popular;
  const totalPages = Math.ceil(cards.length / PER_PAGE);
  const safePage = Math.min(page, Math.max(1, totalPages));

  const pageSlice = useMemo(
    () => cards.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [cards, safePage]
  );

  function handleSortChange(s: SortOption) {
    setSort(s);
    setPage(1);
  }

  return (
    <>
      <p className="text-gray-400 text-sm mb-6">
        {total.toLocaleString()} cards with multiple illustrations
      </p>

      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => handleSortChange("popular")}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
            sort === "popular"
              ? "border-amber-500 text-amber-400 bg-amber-500/10"
              : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
          }`}
        >
          Most Popular
        </button>
        <button
          onClick={() => handleSortChange("prints")}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
            sort === "prints"
              ? "border-amber-500 text-amber-400 bg-amber-500/10"
              : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
          }`}
        >
          Most Prints
        </button>
      </div>

      {/* Card list */}
      <div className="space-y-2">
        {pageSlice.map((card, i) => {
          const rank = (safePage - 1) * PER_PAGE + i + 1;
          return (
            <Link
              key={card.oracle_id}
              href={`/card/${card.slug}`}
              className="flex items-center gap-3 p-2 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <span className="text-sm text-gray-600 w-8 text-right font-mono shrink-0">
                {rank}.
              </span>
              <img
                src={artCropUrl(card.set_code, card.collector_number, card.image_version)}
                alt={card.name}
                className="w-12 h-9 object-cover rounded shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-200 truncate">
                    {card.name}
                  </span>
                  <span className="text-xs text-gray-500 ml-2 shrink-0">
                    {sort === "popular"
                      ? `${card.total_votes.toLocaleString()} votes`
                      : `${card.illustration_count} prints`}
                  </span>
                </div>
                {card.type_line && (
                  <p className="text-xs text-gray-500 truncate">{card.type_line}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <ClientPagination
        total={cards.length}
        pageSize={PER_PAGE}
        currentPage={safePage}
        onPageChange={setPage}
      />
    </>
  );
}
