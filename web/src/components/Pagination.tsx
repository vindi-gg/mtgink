"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function Pagination({
  total,
  pageSize,
  currentPage,
}: {
  total: number;
  pageSize: number;
  currentPage: number;
}) {
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  function pageUrl(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page > 1) params.set("page", String(page));
    else params.delete("page");
    return `?${params.toString()}`;
  }

  // Show a window of page numbers around current
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1.5 mt-8">
      {currentPage > 1 && (
        <Link
          href={pageUrl(currentPage - 1)}
          className="px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300 hover:bg-gray-700"
        >
          Prev
        </Link>
      )}
      {start > 1 && (
        <>
          <Link href={pageUrl(1)} className="px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300 hover:bg-gray-700">1</Link>
          {start > 2 && <span className="text-gray-600 px-1">...</span>}
        </>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          href={pageUrl(p)}
          className={`px-3 py-1.5 rounded text-sm ${
            p === currentPage
              ? "bg-amber-500/20 text-amber-400"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          {p}
        </Link>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-gray-600 px-1">...</span>}
          <Link href={pageUrl(totalPages)} className="px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300 hover:bg-gray-700">{totalPages}</Link>
        </>
      )}
      {currentPage < totalPages && (
        <Link
          href={pageUrl(currentPage + 1)}
          className="px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300 hover:bg-gray-700"
        >
          Next
        </Link>
      )}
    </div>
  );
}
