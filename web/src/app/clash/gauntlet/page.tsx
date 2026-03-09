import Link from "next/link";

export const metadata = {
  title: "Clash Gauntlet — MTG Ink",
  description: "32 cards, single elimination — coming soon",
};

export default function ClashGauntletPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
            <Link
              href="/clash"
              className="px-5 py-2 text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              VS
            </Link>
            <span className="px-5 py-2 text-sm font-bold bg-amber-500 text-gray-900">
              Gauntlet
            </span>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-4">Clash Gauntlet</h1>
        <p className="text-gray-400 mb-2">
          10 cards. Winner stays, faces the next challenger.
        </p>
        <p className="text-gray-600 text-sm mb-8">
          King of the hill for cards.
        </p>
        <div className="inline-block px-6 py-3 rounded-xl border border-gray-800 text-gray-600">
          Coming Soon
        </div>
      </div>
    </main>
  );
}
