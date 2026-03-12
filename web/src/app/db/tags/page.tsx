import { Suspense } from "react";
import Link from "next/link";
import { getTags } from "@/lib/queries";
import DbSearch from "@/components/DbSearch";
import Pagination from "@/components/Pagination";

export const revalidate = 3600;

const PAGE_SIZE = 50;

export const metadata = {
  title: "Tags — MTG Ink",
  description: "Browse Magic: The Gathering cards by Scryfall community tags.",
};

async function TagsList({ query, type, page }: { query: string; type: string; page: number }) {
  const { tags, total } = await getTags(query || undefined, type || undefined, page, PAGE_SIZE);

  if (tags.length === 0) {
    return (
      <p className="text-gray-500 py-8 text-center">
        {query ? "No tags found" : "No tags imported yet. Run the tag import job to populate."}
      </p>
    );
  }

  return (
    <>
      <p className="text-gray-400 text-sm mb-4">
        {total.toLocaleString()} tags
      </p>
      <div className="grid gap-1">
        {tags.map((tag) => (
          <Link
            key={tag.tag_id}
            href={`/db/tags/${encodeURIComponent(tag.tag_id)}`}
            className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-white font-medium truncate">{tag.label}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 shrink-0">
                {tag.type === "illustration" ? "art" : "card"}
              </span>
            </div>
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

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const { q = "", type = "", page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/db" className="text-gray-500 hover:text-gray-300 text-sm">
            Database
          </Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-3xl font-bold">Tags</h1>
        </div>
        <div className="flex items-center gap-3 mt-4 mb-4">
          <div className="flex-1">
            <Suspense>
              <DbSearch placeholder="Search tags..." />
            </Suspense>
          </div>
          <div className="flex gap-1 shrink-0">
            {[
              { label: "All", value: "" },
              { label: "Art", value: "illustration" },
              { label: "Card", value: "oracle" },
            ].map((opt) => (
              <Link
                key={opt.value}
                href={`/db/tags?${new URLSearchParams({ ...(q ? { q } : {}), ...(opt.value ? { type: opt.value } : {}) }).toString()}`}
                className={`px-3 py-1.5 rounded text-sm ${
                  type === opt.value
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
        <Suspense fallback={<p className="text-gray-500">Loading tags...</p>}>
          <TagsList query={q} type={type} page={page} />
        </Suspense>
      </div>
    </main>
  );
}
