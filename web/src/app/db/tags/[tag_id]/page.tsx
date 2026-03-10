import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTagById, getCardsByTag } from "@/lib/queries";
import CardGrid from "@/components/CardGrid";
import Pagination from "@/components/Pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag_id: string }>;
}): Promise<Metadata> {
  const { tag_id } = await params;
  const tag = await getTagById(decodeURIComponent(tag_id));
  if (!tag) return { title: "Tag Not Found — MTG Ink" };
  return {
    title: `${tag.label} — Tags — MTG Ink`,
    description: `Browse all cards tagged "${tag.label}" in Magic: The Gathering.`,
  };
}

export default async function TagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tag_id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tag_id } = await params;
  const { page: pageStr } = await searchParams;
  const tagId = decodeURIComponent(tag_id);
  const page = Math.max(1, parseInt(pageStr || "1", 10));

  const tag = await getTagById(tagId);
  if (!tag) notFound();

  const { cards, total } = await getCardsByTag(tagId, page, PAGE_SIZE);

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-1 text-sm">
          <Link href="/db" className="text-gray-500 hover:text-gray-300">
            Database
          </Link>
          <span className="text-gray-600">/</span>
          <Link href="/db/tags" className="text-gray-500 hover:text-gray-300">
            Tags
          </Link>
          <span className="text-gray-600">/</span>
        </div>

        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-bold">{tag.label}</h1>
          <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">
            {tag.type === "illustration" ? "art tag" : "card tag"}
          </span>
        </div>
        {tag.description && (
          <p className="text-gray-400 text-sm mb-1">{tag.description}</p>
        )}
        <p className="text-gray-500 text-sm mb-6">
          {total.toLocaleString()} cards
        </p>

        {cards.length === 0 ? (
          <p className="text-gray-500 py-8 text-center">No cards found for this tag.</p>
        ) : (
          <>
            <CardGrid cards={cards} />
            <Suspense>
              <Pagination total={total} pageSize={PAGE_SIZE} currentPage={page} />
            </Suspense>
          </>
        )}
      </div>
    </main>
  );
}
