import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSetByCode, getCardsForSet, getBackFaceUrlsForSet } from "@/lib/queries";
import { collectionPageJsonLd, breadcrumbJsonLd, JsonLd } from "@/lib/jsonld";
import SetCardGrid from "@/components/SetCardGrid";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ set_code: string }>;
}): Promise<Metadata> {
  const { set_code } = await params;
  const set = await getSetByCode(set_code);
  if (!set) return { title: "Set Not Found" };
  return {
    title: `${set.name} (${set.set_code.toUpperCase()}) - All Cards`,
    description: `Browse all ${set.card_count ?? ""} cards in ${set.name}. Compare card art and find the best illustrations.${set.released_at ? ` Released ${set.released_at}.` : ""}`,
    alternates: { canonical: `https://mtg.ink/db/expansions/${set_code}` },
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

  const [cards, backFaceUrls] = await Promise.all([
    getCardsForSet(set_code),
    getBackFaceUrlsForSet(set_code),
  ]);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <JsonLd data={[
          collectionPageJsonLd(
            set.name,
            `All ${cards.length} cards in ${set.name}`,
            `/db/expansions/${set_code}`,
            cards.length,
          ),
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Expansions", url: "/db/expansions" },
            { name: set.name, url: `/db/expansions/${set_code}` },
          ]),
        ]} />
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
        <p className="text-gray-400 text-sm mb-6">
          {set.set_type} &middot; {set.released_at?.slice(0, 4)} &middot;{" "}
          {cards.length} cards
        </p>

        <SetCardGrid cards={cards} setCode={set_code} backFaceUrls={backFaceUrls} />
    </main>
  );
}
