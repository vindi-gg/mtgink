import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCardsByTribe, getCreatureTribes } from "@/lib/queries";
import CardGrid from "@/components/CardGrid";
import Pagination from "@/components/Pagination";

export const revalidate = 3600;

const PAGE_SIZE = 30;

async function getTribeBySlug(slug: string) {
  const tribes = await getCreatureTribes();
  return tribes.find((t) => t.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const tribe = await getTribeBySlug(type);
  if (!tribe) return { title: "Tribe Not Found — MTG Ink" };
  return {
    title: `${tribe.tribe} — Creature Tribes — MTG Ink`,
    description: `Browse all ${tribe.card_count.toLocaleString()} ${tribe.tribe} creatures in Magic: The Gathering.`,
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
            <Link
              href={`/showdown/remix?subtype=${encodeURIComponent(tribe.tribe.toLowerCase())}`}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
            >
              Remix
            </Link>
            <Link
              href={`/showdown/vs?subtype=${encodeURIComponent(tribe.tribe.toLowerCase())}`}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
            >
              VS
            </Link>
            <Link
              href={`/showdown/gauntlet?subtype=${encodeURIComponent(tribe.tribe.toLowerCase())}&type=Creature`}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-500 text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              Gauntlet
            </Link>
          </div>
        </div>

        <CardGrid cards={cards} />

        <Suspense>
          <Pagination total={total} pageSize={PAGE_SIZE} currentPage={page} />
        </Suspense>
    </main>
  );
}
