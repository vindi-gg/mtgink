import Link from "next/link";
import { getCreatureTribes } from "@/lib/queries";
import TribesListClient from "@/components/TribesListClient";

export const revalidate = 3600;

export const metadata = {
  title: "Creature Tribes",
  description: "Browse all MTG creature types. Find every Goblin, Elf, Dragon, Zombie, and more.",
  alternates: { canonical: "https://mtg.ink/db/tribes" },
};

export default async function TribesPage() {
  const tribes = await getCreatureTribes();

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/db" className="text-gray-500 hover:text-gray-300 text-sm">
            Database
          </Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-3xl font-bold">Tribes</h1>
        </div>
        <div className="mt-4">
          <TribesListClient tribes={tribes} />
        </div>
    </main>
  );
}
