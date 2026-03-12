import Link from "next/link";
import { getAllArtists } from "@/lib/queries";
import { artCropUrl } from "@/lib/image-utils";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Artists",
  description:
    "Browse Magic: The Gathering artists ranked by popularity and illustration count.",
};

type SortOption = "illustrations" | "popular";
type PeriodOption = "week" | "month" | "all";

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; period?: string; page?: string }>;
}) {
  const params = await searchParams;
  const sort: SortOption =
    params.sort === "popular" ? "popular" : "illustrations";
  const period: PeriodOption =
    params.period === "week"
      ? "week"
      : params.period === "month"
        ? "month"
        : "all";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const perPage = 60;

  const { artists, total } = await getAllArtists(
    sort,
    period,
    perPage,
    (page - 1) * perPage
  );

  const totalPages = Math.ceil(total / perPage);

  function sortUrl(s: SortOption, p?: PeriodOption) {
    const sp = new URLSearchParams();
    sp.set("sort", s);
    if (s === "popular" && p) sp.set("period", p);
    return `/artists?${sp.toString()}`;
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <h1 className="text-3xl font-bold mb-1">Artists</h1>
        <p className="text-gray-400 text-sm mb-6">
          {total.toLocaleString()} artists
        </p>

        {/* Sort controls */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Link
            href={sortUrl("illustrations")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sort === "illustrations"
                ? "bg-amber-500 text-gray-900"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Most Illustrations
          </Link>
          <Link
            href={sortUrl("popular", period)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sort === "popular"
                ? "bg-amber-500 text-gray-900"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Most Popular
          </Link>

          {sort === "popular" && (
            <div className="flex items-center gap-1 ml-2">
              {(["week", "month", "all"] as PeriodOption[]).map((p) => (
                <Link
                  key={p}
                  href={sortUrl("popular", p)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    period === p
                      ? "bg-gray-700 text-white"
                      : "text-gray-500 hover:text-white"
                  }`}
                >
                  {p === "all" ? "All Time" : p === "month" ? "Month" : "Week"}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Artist grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {artists.map((artist) => (
            <Link
              key={artist.id}
              href={`/artists/${artist.slug}`}
              className="group relative bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-amber-500/50 transition-colors"
            >
              {/* Hero image */}
              <div className="aspect-[4/3] bg-gray-800 overflow-hidden">
                {artist.hero_set_code && artist.hero_collector_number ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={artCropUrl(
                      artist.hero_set_code,
                      artist.hero_collector_number,
                      artist.hero_image_version
                    )}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700">
                    <svg
                      className="w-8 h-8"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-white truncate">
                  {artist.name}
                </p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-gray-500">
                    {artist.illustration_count} illustrations
                  </span>
                  {sort === "popular" && artist.total_votes != null && artist.total_votes > 0 && (
                    <span className="text-xs text-amber-400">
                      {artist.total_votes.toLocaleString()} votes
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            {page > 1 && (
              <Link
                href={`/artists?sort=${sort}${sort === "popular" ? `&period=${period}` : ""}&page=${page - 1}`}
                className="px-3 py-1.5 bg-gray-800 text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
              >
                Previous
              </Link>
            )}
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/artists?sort=${sort}${sort === "popular" ? `&period=${period}` : ""}&page=${page + 1}`}
                className="px-3 py-1.5 bg-gray-800 text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        )}
    </main>
  );
}
