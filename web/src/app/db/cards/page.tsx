import Link from "next/link";
import { getTopCards } from "@/lib/queries";
import { artCropUrl } from "@/lib/image-utils";
import DbCardSearch from "@/components/DbCardSearch";

export const revalidate = 3600;

export const metadata = {
  title: "Cards — MTG Ink",
  description: "Top Magic: The Gathering cards by popularity and number of prints.",
};

type SortOption = "popular" | "prints";

export default async function DbCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const sort: SortOption = params.sort === "prints" ? "prints" : "popular";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const perPage = 50;

  const { cards, total } = await getTopCards(sort, perPage, (page - 1) * perPage);
  const totalPages = Math.ceil(total / perPage);

  function sortUrl(s: SortOption) {
    return `/db/cards?sort=${s}`;
  }

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    sp.set("sort", sort);
    sp.set("page", String(p));
    return `/db/cards?${sp.toString()}`;
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
      <h1 className="text-3xl font-bold mb-1">Cards</h1>
      <p className="text-gray-400 text-sm mb-6">
        {total.toLocaleString()} cards with multiple illustrations
      </p>

      {/* Search */}
      <div className="mb-6">
        <DbCardSearch />
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={sortUrl("popular")}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            sort === "popular"
              ? "border-amber-500 text-amber-400 bg-amber-500/10"
              : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
          }`}
        >
          Most Popular
        </Link>
        <Link
          href={sortUrl("prints")}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            sort === "prints"
              ? "border-amber-500 text-amber-400 bg-amber-500/10"
              : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
          }`}
        >
          Most Prints
        </Link>
      </div>

      {/* Card list */}
      <div className="space-y-2">
        {cards.map((card, i) => {
          const rank = (page - 1) * perPage + i + 1;
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
