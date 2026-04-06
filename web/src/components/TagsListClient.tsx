"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Tag } from "@/lib/types";
import ClientPagination from "@/components/ClientPagination";

const PAGE_SIZE = 50;

export default function TagsListClient({
  tags,
  basePath,
  emptyLabel,
}: {
  tags: Tag[];
  basePath: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query) return tags;
    const q = query.toLowerCase();
    return tags.filter((t) => t.label.toLowerCase().includes(q));
  }, [tags, query]);

  // Reset to page 1 when search changes
  const safeTotal = filtered.length;
  const totalPages = Math.ceil(safeTotal / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const pageSlice = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  if (tags.length === 0) {
    return (
      <p className="text-gray-500 py-8 text-center">{emptyLabel}</p>
    );
  }

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={`Search ${basePath.includes("art") ? "art" : "card"} tags...`}
          className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
        />
      </div>
      <p className="text-gray-400 text-sm mb-4">
        {safeTotal.toLocaleString()} {basePath.includes("art") ? "art" : "card"} tags
      </p>
      <div className="grid gap-1">
        {pageSlice.map((tag) => (
          <Link
            key={tag.tag_id}
            href={`${basePath}/${tag.slug}`}
            className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <span className="text-white font-medium truncate">{tag.label}</span>
            <span className="text-gray-500 text-sm shrink-0 ml-4">
              {tag.usage_count.toLocaleString()}
            </span>
          </Link>
        ))}
      </div>
      <ClientPagination
        total={safeTotal}
        pageSize={PAGE_SIZE}
        currentPage={safePage}
        onPageChange={setPage}
      />
    </>
  );
}
