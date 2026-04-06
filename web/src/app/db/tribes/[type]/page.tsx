import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import { getCardsByTribe, getCreatureTribes } from "@/lib/queries";
import { collectionPageJsonLd, breadcrumbJsonLd, JsonLd } from "@/lib/jsonld";
import CardGrid from "@/components/CardGrid";
import Pagination from "@/components/Pagination";

export const revalidate = 3600;

const PAGE_SIZE = 30;

// cache() deduplicates across generateMetadata + page render in the same request
const getCachedTribes = cache(() => getCreatureTribes());

async function getTribeBySlug(slug: string) {
  const tribes = await getCachedTribes();
  return tribes.find((t) => t.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const tribe = await getTribeBySlug(type);
  if (!tribe) return { title: "Tribe Not Found" };
  return {
    title: `${tribe.tribe} - MTG Creatures`,
    description: `Browse all ${tribe.card_count.toLocaleString()} MTG ${tribe.tribe} creatures. Compare art across every printing.`,
    alternates: { canonical: `https://mtg.ink/db/tribes/${type}` },
  };
}

export default async function TribeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { type } = await params;
  const { page: pageStr, sort: sortParam } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));
  const sort = sortParam === "name" ? "name" as const : sortParam === "price" ? "price" as const : "popular" as const;

  const tribe = await getTribeBySlug(type);
  if (!tribe) notFound();

  const { cards, total } = await getCardsByTribe(type, page, PAGE_SIZE, sort);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <JsonLd data={[
          collectionPageJsonLd(
            tribe.tribe,
            `All ${total.toLocaleString()} MTG ${tribe.tribe} creatures`,
            `/db/tribes/${type}`,
            total,
          ),
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Tribes", url: "/db/tribes" },
            { name: tribe.tribe, url: `/db/tribes/${type}` },
          ]),
        ]} />
        <div className="flex items-center gap-3 mb-1 text-sm">
          <Link href="/db" className="text-gray-500 hover:text-gray-300">
            Database
          </Link>
          <span className="text-gray-600">/</span>
          <Link href="/db/tribes" className="text-gray-500 hover:text-gray-300">
            Tribes
          </Link>
          <span className="text-gray-600">/</span>
        </div>

        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">{tribe.tribe}</h1>
            <p className="text-gray-400 text-sm">
              {total.toLocaleString()} creatures
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
              <Link
                href={`/db/tribes/${type}`}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  sort === "popular"
                    ? "bg-amber-500 text-gray-900"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                Popular
              </Link>
              <Link
                href={`/db/tribes/${type}?sort=price`}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  sort === "price"
                    ? "bg-amber-500 text-gray-900"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                $
              </Link>
              <Link
                href={`/db/tribes/${type}?sort=name`}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  sort === "name"
                    ? "bg-amber-500 text-gray-900"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                A–Z
              </Link>
            </div>
          </div>
        </div>

        <CardGrid cards={cards} />

        <Suspense>
          <Pagination total={total} pageSize={PAGE_SIZE} currentPage={page} />
        </Suspense>
    </main>
  );
}
