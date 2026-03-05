import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="text-center max-w-xl">
        <h1 className="text-5xl font-bold mb-4">
          MTG <span className="text-amber-400">Ink</span>
        </h1>
        <p className="text-gray-400 text-lg mb-8">
          Discover and rank the best Magic: The Gathering card art. Pick your
          favorites in head-to-head matchups.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/compare"
            className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors text-lg"
          >
            Start Comparing
          </Link>
          <Link
            href="/browse"
            className="px-6 py-3 border border-gray-700 text-gray-300 font-medium rounded-lg hover:border-gray-500 hover:text-white transition-colors text-lg"
          >
            Browse Cards
          </Link>
        </div>
      </div>
    </main>
  );
}
