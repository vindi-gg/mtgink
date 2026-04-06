import Link from "next/link";
import { getAllTagsByType } from "@/lib/queries";
import TagsListClient from "@/components/TagsListClient";

export const revalidate = 3600;

export const metadata = {
  title: "Card Tags",
  description: "Browse MTG cards by community-curated card tags.",
  alternates: { canonical: "https://mtg.ink/db/tags" },
};

export default async function CardTagsPage() {
  const tags = await getAllTagsByType("oracle");

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/db" className="text-gray-500 hover:text-gray-300 text-sm">
          Database
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-3xl font-bold">Card Tags</h1>
      </div>
      <p className="text-sm text-gray-500 mb-2">
        Community-curated tags maintained by volunteers on{" "}
        <a href="https://tagger.scryfall.com" target="_blank" rel="noopener noreferrer" className="text-amber-500/70 hover:text-amber-400 transition-colors">
          Scryfall Tagger
        </a>
        {" "}&middot;{" "}
        <Link href="/db/art-tags" className="text-amber-500/70 hover:text-amber-400 transition-colors">
          Art Tags
        </Link>
      </p>
      <TagsListClient
        tags={tags}
        basePath="/db/tags"
        emptyLabel="No card tags imported yet."
      />
    </main>
  );
}
