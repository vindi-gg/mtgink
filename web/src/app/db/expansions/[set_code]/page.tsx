import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSetByCode, getCardsForSet } from "@/lib/queries";
import SetCardGrid from "@/components/SetCardGrid";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ set_code: string }>;
}): Promise<Metadata> {
  const { set_code } = await params;
  const set = await getSetByCode(set_code);
  if (!set) return { title: "Set Not Found — MTG Ink" };
  return {
    title: `${set.name} — MTG Ink`,
    description: `Browse all ${set.card_count ?? ""} cards in ${set.name} (${set.set_code.toUpperCase()}).${set.released_at ? ` Released ${set.released_at}.` : ""}`,
  };
}

export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ set_code: string }>;
}) {
  const { set_code } = await params;
  const set = await getSetByCode(set_code);
  if (!set) notFound();

  const cards = await getCardsForSet(set_code);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <div className="flex items-center gap-3 mb-1 text-sm">
          <Link href="/db" className="text-gray-500 hover:text-gray-300">
            Database
          </Link>
          <span className="text-gray-600">/</span>
          <Link href="/db/expansions" className="text-gray-500 hover:text-gray-300">
            Expansions
          </Link>
          <span className="text-gray-600">/</span>
        </div>

        <div className="flex items-center gap-3 mb-1">
          {set.icon_svg_uri && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={set.icon_svg_uri}
              alt=""
              className="h-8 w-8 invert opacity-70"
            />
          )}
          <h1 className="text-3xl font-bold">{set.name}</h1>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <p className="text-gray-400 text-sm">
            {set.set_type} &middot; {set.released_at?.slice(0, 4)} &middot;{" "}
            {cards.length} cards
          </p>
          <Link
            href={`/showdown/remix?set_code=${set_code}`}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
          >
            Remix
          </Link>
          <Link
            href={`/showdown/vs?set_code=${set_code}`}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
          >
            VS
          </Link>
          <Link
            href={`/showdown/gauntlet?set_code=${set_code}`}
            className="px-3 py-1 text-xs font-medium rounded-lg border border-amber-500 text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            Gauntlet
          </Link>
        </div>

        <SetCardGrid cards={cards} setCode={set_code} />
    </main>
  );
}
