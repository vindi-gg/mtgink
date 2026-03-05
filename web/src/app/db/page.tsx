import Link from "next/link";

export default function DbIndexPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Database</h1>
        <p className="text-gray-400 mb-8">
          Browse the complete Magic: The Gathering card database.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/db/expansions"
            className="block p-6 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <h2 className="text-xl font-bold mb-1">Expansions</h2>
            <p className="text-gray-400 text-sm">
              Browse sets, expansions, and products
            </p>
          </Link>
          <Link
            href="/db/cards"
            className="block p-6 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <h2 className="text-xl font-bold mb-1">Cards</h2>
            <p className="text-gray-400 text-sm">
              Search all 36,000+ unique cards
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
