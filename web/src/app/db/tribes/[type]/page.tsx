import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCardsByTribe, getCreatureTribes } from "@/lib/queries";
import CardGrid from "@/components/CardGrid";
import Pagination from "@/components/Pagination";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ page?: string }>;
}) {
  const { type } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));

  const tribe = await getTribeBySlug(type);
  if (!tribe) notFound();

  const { cards, total } = await getCardsByTribe(type, page, PAGE_SIZE);

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-7xl mx-auto">
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
        </div>

        <CardGrid cards={cards} />

        <Suspense>
          <Pagination total={total} pageSize={PAGE_SIZE} currentPage={page} />
        </Suspense>
      </div>
    </main>
  );
}
