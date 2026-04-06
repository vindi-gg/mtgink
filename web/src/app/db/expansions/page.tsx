import Link from "next/link";
import { getPlayableSets, getAllSets } from "@/lib/queries";
import ExpansionsListClient from "@/components/ExpansionsListClient";

export const revalidate = 3600;

export const metadata = {
  title: "Expansions",
  description: "Browse all MTG expansions, sets, and products.",
  alternates: { canonical: "https://mtg.ink/db/expansions" },
};

export default async function ExpansionsPage() {
  const [playableSets, allSets] = await Promise.all([
    getPlayableSets(),
    getAllSets(),
  ]);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <div className="flex items-center gap-2 mb-1 text-sm">
          <Link href="/db" className="text-gray-500 hover:text-gray-300">
            Database
          </Link>
          <span className="text-gray-600">/</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-1">Expansions</h1>
        <ExpansionsListClient playableSets={playableSets} allSets={allSets} />
    </main>
  );
}
