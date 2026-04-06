"use client";

export default function ClientPagination({
  total,
  pageSize,
  currentPage,
  onPageChange,
}: {
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1.5 mt-8">
      {currentPage > 1 && (
        <button
          onClick={() => onPageChange(currentPage - 1)}
          className="px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          Prev
        </button>
      )}
      {start > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className="px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            1
          </button>
          {start > 2 && <span className="text-gray-600 px-1">...</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-3 py-1.5 rounded text-sm cursor-pointer ${
            p === currentPage
              ? "bg-amber-500/20 text-amber-400"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && (
            <span className="text-gray-600 px-1">...</span>
          )}
          <button
            onClick={() => onPageChange(totalPages)}
            className="px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            {totalPages}
          </button>
        </>
      )}
      {currentPage < totalPages && (
        <button
          onClick={() => onPageChange(currentPage + 1)}
          className="px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          Next
        </button>
      )}
    </div>
  );
}
