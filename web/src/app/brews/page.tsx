import Link from "next/link";
import { listPublicBrews } from "@/lib/brew-queries";
import { artCropUrl } from "@/lib/image-utils";
import type { Brew } from "@/lib/types";

export const revalidate = 60;

export const metadata = {
  title: "Brews",
  description: "Community-created custom showdowns",
};

const MODE_COLORS: Record<string, string> = {
  bracket: "bg-emerald-500/20 text-emerald-400",
  gauntlet: "bg-red-500/20 text-red-400",
  remix: "bg-amber-500/20 text-amber-400",
  vs: "bg-blue-500/20 text-blue-400",
};

// Filter chips rendered at the top of the listing. Order = display order.
// Each entry's `mode` value is what gets passed to listPublicBrews.
const MODE_FILTERS: { key: string; label: string; mode: string | null }[] = [
  { key: "all", label: "All", mode: null },
  { key: "bracket", label: "Brackets", mode: "bracket" },
  { key: "gauntlet", label: "Gauntlets", mode: "gauntlet" },
];

/** Card count for a brew — bracket_size on bracket brews, pool_size on
 *  every other mode. Null when neither is set. */
function brewCardCount(brew: Brew): number | null {
  if (brew.mode === "bracket") return brew.bracket_size;
  return brew.pool_size;
}

/** Build a listing URL that preserves the sort + mode pair so clicking
 *  one chip doesn't reset the other. */
function listingHref(params: { sort: string; mode?: string | null }): string {
  const search = new URLSearchParams();
  if (params.sort && params.sort !== "popular") search.set("sort", params.sort);
  if (params.mode) search.set("mode", params.mode);
  const qs = search.toString();
  return qs ? `/brews?${qs}` : "/brews";
}

export default async function BrewListPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; mode?: string }>;
}) {
  const { sort: sortParam, mode: modeParam } = await searchParams;
  const sort = sortParam === "newest" ? "newest" : "popular";
  const activeMode = MODE_FILTERS.some((f) => f.mode === modeParam)
    ? (modeParam ?? null)
    : null;
  const { brews, total } = await listPublicBrews(sort, 40, 0, undefined, activeMode ?? undefined);

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Brews</h1>
            <p className="text-gray-500 text-sm mt-1">
              {total} community showdown{total !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/brew"
            className="px-5 py-2.5 rounded-lg font-semibold text-sm bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
          >
            Create Brew
          </Link>
        </div>

        {/* Mode filter chips */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {MODE_FILTERS.map((f) => {
            const isActive = (activeMode ?? null) === (f.mode ?? null);
            return (
              <Link
                key={f.key}
                href={listingHref({ sort, mode: f.mode })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-amber-500 text-gray-900"
                    : "bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {/* Sort toggle */}
        <div className="flex gap-2 mb-6">
          <Link
            href={listingHref({ sort: "popular", mode: activeMode })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sort === "popular"
                ? "bg-gray-700 text-white"
                : "bg-gray-800/50 text-gray-400 hover:bg-gray-800"
            }`}
          >
            Popular
          </Link>
          <Link
            href={listingHref({ sort: "newest", mode: activeMode })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sort === "newest"
                ? "bg-gray-700 text-white"
                : "bg-gray-800/50 text-gray-400 hover:bg-gray-800"
            }`}
          >
            Newest
          </Link>
        </div>

        {/* Grid */}
        {brews.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-4">No brews yet</p>
            <Link href="/brew" className="text-amber-400 hover:text-amber-300">
              Create the first one
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brews.map((brew) => {
              const count = brewCardCount(brew);
              return (
                <Link
                  key={brew.id}
                  href={`/brew/${brew.slug}`}
                  className="group bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors"
                >
                  {/* Preview image */}
                  <div className="relative aspect-[3/2] bg-gray-800 overflow-hidden">
                    {brew.preview_set_code && brew.preview_collector_number ? (
                      <img
                        src={artCropUrl(brew.preview_set_code, brew.preview_collector_number, brew.preview_image_version)}
                        alt={brew.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                        No preview
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-transparent to-transparent" />

                    {/* Mode badge */}
                    <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${MODE_COLORS[brew.mode] ?? "bg-gray-700 text-gray-300"}`}>
                      {brew.mode}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm truncate group-hover:text-amber-400 transition-colors">
                      {brew.name}
                    </h3>
                    <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                      <span className="truncate">{brew.source_label}</span>
                      <span className="flex-shrink-0 ml-2">
                        {count != null && (
                          <>
                            <span className="text-gray-400">{count}</span> cards ·{" "}
                          </>
                        )}
                        {brew.play_count.toLocaleString()} plays
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
