import { Suspense } from "react";
import Link from "next/link";
import { getTags } from "@/lib/queries";
import DbSearch from "@/components/DbSearch";
import Pagination from "@/components/Pagination";

export const revalidate = 3600;

const PAGE_SIZE = 50;

export const metadata = {
  title: "Art Tags — MTG Ink",
  description: "Browse Magic: The Gathering cards by community-curated art and illustration tags.",
};

async function TagsList({ query, page }: { query: string; page: number }) {
  const { tags, total } = await getTags(query || undefined, "illustration", page, PAGE_SIZE, "scryfall");

  if (tags.length === 0) {
    return (
      <p className="text-gray-500 py-8 text-center">
        {query ? "No art tags found" : "No art tags imported yet."}
      </p>
    );
  }

  return (
    <>
      <p className="text-gray-400 text-sm mb-4">
        {total.toLocaleString()} art tags
      </p>
      <div className="grid gap-1">
        {tags.map((tag) => (
          <Link
            key={tag.tag_id}
            href={`/db/art-tags/${tag.slug}`}
            className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <span className="text-white font-medium truncate">{tag.label}</span>
            <span className="text-gray-500 text-sm shrink-0 ml-4">
              {tag.usage_count.toLocaleString()}
            </span>
          </Link>
        ))}
      </div>
      <Suspense>
        <Pagination total={total} pageSize={PAGE_SIZE} currentPage={page} />
      </Suspense>
    </>
  );
}

export default async function ArtTagsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/db" className="text-gray-500 hover:text-gray-300 text-sm">
          Database
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-3xl font-bold">Art Tags</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Community-curated illustration tags maintained by volunteers on{" "}
        <a href="https://tagger.scryfall.com" target="_blank" rel="noopener noreferrer" className="text-amber-500/70 hover:text-amber-400 transition-colors">
          Scryfall Tagger
        </a>
      </p>
      <div className="mb-4">
        <Suspense>
          <DbSearch placeholder="Search art tags..." />
        </Suspense>
      </div>
      <Suspense fallback={<p className="text-gray-500">Loading art tags...</p>}>
        <TagsList query={q} page={page} />
      </Suspense>
    </main>
  );
}
