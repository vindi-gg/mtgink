import Link from "next/link";
import { getPlayableSets, getAllSets } from "@/lib/queries";

export const revalidate = 3600;

export const metadata = {
  title: "Expansions",
  description: "Browse all MTG expansions, sets, and products.",
  alternates: { canonical: "https://mtg.ink/db/expansions" },
};

export default async function ExpansionsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const params = await searchParams;
  const showAll = params.all === "1";
  const sets = showAll ? await getAllSets() : await getPlayableSets();

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <div className="flex items-center gap-2 mb-1 text-sm">
          <Link href="/db" className="text-gray-500 hover:text-gray-300">
            Database
          </Link>
          <span className="text-gray-600">/</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-1">Expansions</h1>
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-400 text-sm">
            {sets.length} sets and products
          </p>
          <Link
            href={showAll ? "/db/expansions" : "/db/expansions?all=1"}
            className="text-amber-400 hover:text-amber-300 text-sm"
          >
            {showAll ? "Playable only" : "Show all"}
          </Link>
        </div>
        <div className="grid gap-1.5 md:gap-1">
          {sets.map((set) => (
            <Link
              key={set.set_code}
              href={`/db/expansions/${set.set_code}`}
              className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
            >
              {set.icon_svg_uri && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={set.icon_svg_uri}
                  alt=""
                  className="h-5 w-5 invert opacity-70 flex-shrink-0 self-start md:self-center mt-0.5 md:mt-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-white font-medium truncate block text-sm md:text-base">
                  {set.name}
                </span>
                <span className="text-gray-500 text-xs md:hidden">
                  {set.set_code.toUpperCase()} &middot; {set.released_at?.slice(0, 4)} &middot; {set.card_count} cards
                </span>
              </div>
              <span className="text-gray-500 text-xs uppercase tracking-wide hidden md:inline">
                {set.set_code}
              </span>
              <span className="text-gray-500 text-sm hidden md:inline">
                {set.released_at?.slice(0, 4)}
              </span>
              <span className="text-gray-500 text-sm w-20 text-right hidden md:inline whitespace-nowrap">
                {set.card_count} cards
              </span>
            </Link>
          ))}
        </div>
    </main>
  );
}
