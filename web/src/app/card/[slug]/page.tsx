import type { Metadata } from "next";
import Link from "next/link";
import {
  getCardBySlug,
  getIllustrationsForCard,
  getRatingsForCard,
  getPrintingsForCard,
  slugify,
} from "@/lib/queries";
import { getAdminClient } from "@/lib/supabase/admin";
import ArtGallery from "@/components/ArtGallery";
import { normalCardUrl, artCropUrl } from "@/lib/image-utils";
import { notFound } from "next/navigation";

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
    ? artCropUrl(topIll.set_code, topIll.collector_number, topIll.image_version)
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

  const [illustrations, ratings, printingsMap, { data: allPrices }] = await Promise.all([
    getIllustrationsForCard(card.oracle_id),
    getRatingsForCard(card.oracle_id),
    getPrintingsForCard(card.oracle_id),
    getAdminClient()
      .from("best_prices")
      .select("scryfall_id, marketplace_display_name, market_price, currency, product_url")
      .in(
        "scryfall_id",
        // Will be filtered after printings load — fetch all for this card
        (await getAdminClient()
          .from("printings")
          .select("scryfall_id")
          .eq("oracle_id", card.oracle_id)).data?.map((p) => p.scryfall_id) ?? []
      ),
  ]);

  // Map scryfall_id -> cheapest price
  const priceMap = new Map<string, { price: number; currency: string; url: string; marketplace: string }>();
  for (const p of allPrices ?? []) {
    if (p.market_price == null) continue;
    const existing = priceMap.get(p.scryfall_id);
    if (!existing || (p.currency === "USD" && (existing.currency !== "USD" || p.market_price < existing.price))) {
      priceMap.set(p.scryfall_id, {
        price: p.market_price,
        currency: p.currency,
        url: p.product_url,
        marketplace: p.marketplace_display_name,
      });
    }
  }
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
            <div className="flex gap-2">
              <Link
                href={`/showdown/remix?oracle_id=${card.oracle_id}`}
                className="px-4 py-2 text-sm bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors"
              >
                Remix
              </Link>
              {illustrations.length >= 3 && (
                <Link
                  href={`/showdown/gauntlet?oracle_id=${card.oracle_id}`}
                  className="px-4 py-2 text-sm border border-amber-500 text-amber-400 font-medium rounded-lg hover:bg-amber-500/10 transition-colors"
                >
                  Gauntlet
                </Link>
              )}
            </div>
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
                    <Link href={`/artists/${slugify(ill.artist)}`} className="hover:text-amber-400 transition-colors">{ill.artist}</Link>
                    <span className="text-gray-600 ml-2">
                      {printings.length} printing
                      {printings.length !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {printings.map((p) => {
                      const price = priceMap.get(p.scryfall_id);
                      return (
                        <div key={p.scryfall_id} className="group">
                          <img
                            src={normalCardUrl(p.set_code, p.collector_number, p.image_version)}
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
                              {price ? (
                                <a
                                  href={price.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-400 hover:text-green-300 ml-auto"
                                >
                                  ${price.price.toFixed(2)}
                                </a>
                              ) : p.tcgplayer_id ? (
                                <a
                                  href={`https://www.tcgplayer.com/product/${p.tcgplayer_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-500/70 hover:text-amber-400 ml-auto"
                                >
                                  Buy
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
