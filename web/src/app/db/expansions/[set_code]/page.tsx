import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSetByCode, getCardsForSet } from "@/lib/queries";
import { normalCardUrl } from "@/lib/image-utils";

export const dynamic = "force-dynamic";

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
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-7xl mx-auto">
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
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {cards.map((card) => (
            <Link
              key={card.scryfall_id}
              href={`/card/${card.slug}`}
              className="group relative"
              title={`${card.name} (#${card.collector_number})`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={normalCardUrl(set_code, card.collector_number, card.image_version)}
                alt={card.name}
                className="w-full rounded-lg border border-gray-800 group-hover:border-amber-500/50 transition-colors"
                loading="lazy"
              />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
