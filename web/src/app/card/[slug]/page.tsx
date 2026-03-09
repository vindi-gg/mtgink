import type { Metadata } from "next";
import {
  getCardBySlug,
  getIllustrationsForCard,
  getRatingsForCard,
  getPrintingsForCard,
} from "@/lib/queries";
import ArtGallery from "@/components/ArtGallery";
import { normalCardUrl, artCropUrl } from "@/lib/image-utils";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await getCardBySlug(slug);
  if (!card) return { title: "Card Not Found — MTG Ink" };

  const illustrations = await getIllustrationsForCard(card.oracle_id);
  const topIll = illustrations[0];

  const title = `${card.name} — MTG Ink`;
  const description = `${illustrations.length} unique illustration${illustrations.length !== 1 ? "s" : ""} of ${card.name}. Compare art versions and vote for your favorite.${card.type_line ? ` ${card.type_line}.` : ""}`;

  const ogImage = topIll
    ? artCropUrl(topIll.set_code, topIll.collector_number)
    : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/card/${card.slug}`,
      ...(ogImage ? { images: [{ url: ogImage, width: 626, height: 457, alt: `${card.name} art by ${topIll.artist}` }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await getCardBySlug(slug);

  if (!card) notFound();

  const [illustrations, ratings, printingsMap] = await Promise.all([
    getIllustrationsForCard(card.oracle_id),
    getRatingsForCard(card.oracle_id),
    getPrintingsForCard(card.oracle_id),
  ]);
  const ratingsMap = new Map(ratings.map((r) => [r.illustration_id, r]));

  const illustrationsWithRatings = illustrations
    .map((ill) => ({
      ...ill,
      rating: ratingsMap.get(ill.illustration_id) ?? null,
    }))
    .sort((a, b) => {
      if (a.rating && b.rating)
        return b.rating.elo_rating - a.rating.elo_rating;
      if (a.rating) return -1;
      if (b.rating) return 1;
      return 0;
    });

  const totalPrintings = Array.from(printingsMap.values()).reduce(
    (sum, ps) => sum + ps.length,
    0
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{card.name}</h1>
            <p className="text-gray-400 text-sm mt-1">
              {illustrations.length} unique illustration
              {illustrations.length !== 1 ? "s" : ""}
              {" · "}
              {totalPrintings} printing{totalPrintings !== 1 ? "s" : ""}
              {card.type_line && ` · ${card.type_line}`}
            </p>
          </div>
          {illustrations.length >= 2 && (
            <Link
              href={`/ink?oracle_id=${card.oracle_id}`}
              className="px-4 py-2 text-sm bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors"
            >
              Compare arts
            </Link>
          )}
        </div>

        <ArtGallery illustrations={illustrationsWithRatings} oracleId={card.oracle_id} />

        <section className="mt-10">
          <h2 className="text-xl font-bold mb-4">
            All Printings
            <span className="text-gray-500 font-normal text-base ml-2">
              {totalPrintings}
            </span>
          </h2>
          <div className="space-y-8">
            {illustrationsWithRatings.map((ill) => {
              const printings = printingsMap.get(ill.illustration_id) ?? [];
              if (printings.length === 0) return null;
              return (
                <div key={ill.illustration_id}>
                  <h3 className="text-sm font-medium text-gray-300 mb-3">
                    {ill.artist}
                    <span className="text-gray-600 ml-2">
                      {printings.length} printing
                      {printings.length !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {printings.map((p) => (
                      <div key={p.scryfall_id} className="group">
                        <img
                          src={normalCardUrl(p.set_code, p.collector_number)}
                          alt={`${card.name} - ${p.set_name} #${p.collector_number}`}
                          className="w-full rounded-lg"
                          loading="lazy"
                        />
                        <div className="mt-1.5 px-0.5">
                          <p className="text-xs text-gray-400 truncate">
                            {p.set_name}
                          </p>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-600">
                              #{p.collector_number}
                            </span>
                            <span
                              className={
                                p.rarity === "mythic"
                                  ? "text-orange-400"
                                  : p.rarity === "rare"
                                    ? "text-amber-400"
                                    : p.rarity === "uncommon"
                                      ? "text-gray-300"
                                      : "text-gray-600"
                              }
                            >
                              {p.rarity}
                            </span>
                            {p.tcgplayer_id && (
                              <a
                                href={`https://www.tcgplayer.com/product/${p.tcgplayer_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-amber-500/70 hover:text-amber-400 ml-auto"
                              >
                                Buy
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
