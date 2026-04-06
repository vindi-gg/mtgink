import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTagBySlug, getCardsByTag } from "@/lib/queries";
import { collectionPageJsonLd, breadcrumbJsonLd, JsonLd } from "@/lib/jsonld";
import CardGrid from "@/components/CardGrid";
import Pagination from "@/components/Pagination";

export const revalidate = 3600;

const PAGE_SIZE = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) return { title: "Tag Not Found" };
  return {
    title: `${tag.label} Art - Card Tag`,
    description: `Browse all MTG cards tagged "${tag.label}". Compare art and discover illustrations.`,
    alternates: { canonical: `https://mtg.ink/db/tags/${slug}` },
  };
}

export default async function TagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));

  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  const { cards, total } = await getCardsByTag(tag.tag_id, page, PAGE_SIZE, tag.type);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <JsonLd data={[
          collectionPageJsonLd(
            tag.label,
            `All MTG cards tagged "${tag.label}"`,
            `/db/tags/${slug}`,
            total,
          ),
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: tag.type === "illustration" ? "Art Tags" : "Card Tags", url: tag.type === "illustration" ? "/db/art-tags" : "/db/tags" },
            { name: tag.label, url: `/db/tags/${slug}` },
          ]),
        ]} />
        <div className="flex items-center gap-3 mb-1 text-sm">
          <Link href="/db" className="text-gray-500 hover:text-gray-300">
            Database
          </Link>
          <span className="text-gray-600">/</span>
          <Link
            href={tag.type === "illustration" ? "/db/art-tags" : "/db/tags"}
            className="text-gray-500 hover:text-gray-300"
          >
            {tag.type === "illustration" ? "Art Tags" : "Card Tags"}
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
        <div className="flex items-center gap-3 mb-6">
          <p className="text-gray-500 text-sm">
            {total.toLocaleString()} cards
          </p>
          {total >= 3 && (
            <Link
              href={`/showdown/gauntlet?tag=${encodeURIComponent(tag.tag_id)}`}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
            >
              Gauntlet
            </Link>
          )}
        </div>

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
    </main>
  );
}
