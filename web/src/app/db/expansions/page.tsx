import Link from "next/link";
import { getPlayableSets, getAllSets } from "@/lib/queries";

export const revalidate = 3600;

export const metadata = {
  title: "Expansions",
  description: "Browse all MTG expansions, sets, and products.",
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
        <div className="flex items-center gap-3 mb-1">
          <Link href="/db" className="text-gray-500 hover:text-gray-300 text-sm">
            Database
          </Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-3xl font-bold">Expansions</h1>
        </div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-400 text-sm">
            {sets.length} sets and products
          </p>
          <Link
            href={showAll ? "/db/expansions" : "/db/expansions?all=1"}
            className="text-amber-400 hover:text-amber-300 text-sm"
          >
            {showAll ? "Show playable sets only" : "Show all sets"}
          </Link>
        </div>
        <div className="grid gap-1">
          {sets.map((set) => (
            <Link
              key={set.set_code}
              href={`/db/expansions/${set.set_code}`}
              className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
            >
              {set.icon_svg_uri && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={set.icon_svg_uri}
                  alt=""
                  className="h-5 w-5 invert opacity-70"
                />
              )}
              <span className="text-white font-medium flex-1 min-w-0 truncate">
                {set.name}
              </span>
              <span className="text-gray-500 text-xs uppercase tracking-wide">
                {set.set_code}
              </span>
              <span className="text-gray-500 text-sm">
                {set.released_at?.slice(0, 4)}
              </span>
              <span className="text-gray-500 text-sm w-16 text-right">
                {set.card_count} cards
              </span>
            </Link>
          ))}
        </div>
    </main>
  );
}
