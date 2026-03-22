import { Suspense } from "react";
import Link from "next/link";
import { getCreatureTribes } from "@/lib/queries";
import DbSearch from "@/components/DbSearch";

export const revalidate = 3600; // tribes change only on data imports

export const metadata = {
  title: "Creature Tribes",
  description: "Browse all MTG creature types. Find every Goblin, Elf, Dragon, Zombie, and more.",
};

async function TribesList({ query }: { query: string }) {
  const allTribes = await getCreatureTribes();
  const tribes = query
    ? allTribes.filter((t) => t.tribe.toLowerCase().includes(query.toLowerCase()))
    : allTribes;

  return (
    <>
      <p className="text-gray-400 text-sm mb-4">
        {tribes.length} creature types
      </p>
      <div className="grid gap-1">
        {tribes.map((tribe) => (
          <Link
            key={tribe.slug}
            href={`/db/tribes/${tribe.slug}`}
            className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <span className="text-white font-medium">{tribe.tribe}</span>
            <span className="text-gray-500 text-sm">
              {tribe.card_count.toLocaleString()} cards
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

export default async function TribesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/db" className="text-gray-500 hover:text-gray-300 text-sm">
            Database
          </Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-3xl font-bold">Tribes</h1>
        </div>
        <div className="mb-4 mt-4">
          <Suspense>
            <DbSearch placeholder="Search creature types..." />
          </Suspense>
        </div>
        <Suspense fallback={<p className="text-gray-500">Loading tribes...</p>}>
          <TribesList query={q} />
        </Suspense>
    </main>
  );
}
