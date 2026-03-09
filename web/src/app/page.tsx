import Link from "next/link";

export const metadata = {
  title: "MTG Ink — Discover & Rank Magic Cards and Art",
  description: "Discover and rank the best Magic: The Gathering cards and art.",
};

const INK_MODES = [
  {
    name: "Mirror",
    description: "Same card, pick the best art version",
    href: "/ink",
    ready: true,
  },
  {
    name: "VS",
    description: "Different cards' art compared by theme",
    href: "/ink?mode=vs",
    ready: true,
  },
  {
    name: "Gauntlet",
    description: "Winner stays, faces the next challenger",
    href: "/ink/gauntlet",
    ready: false,
  },
];

const CLASH_MODES = [
  {
    name: "VS",
    description: "Different cards go head-to-head",
    href: "/clash",
    ready: true,
  },
  {
    name: "Gauntlet",
    description: "Winner stays, faces the next challenger",
    href: "/clash/gauntlet",
    ready: false,
  },
];

const TOOLS = [
  {
    name: "Brew",
    description: "Create & share your own matchup",
    href: "/brew",
    ready: false,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold mb-4 flex flex-col items-center" style={{ lineHeight: 1.1 }}>
          <span className="tracking-widest">MTG</span>
          <span className="text-amber-400" style={{ letterSpacing: "0.32em" }}>INK</span>
        </h1>
        <p className="text-gray-400 text-lg mb-10">
          Discover and rank the best Magic: The Gathering cards and art.
        </p>

        {/* Ink — illustration matchups */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3">Ink — Illustrations</h2>
          <div className="grid grid-cols-1 gap-4">
            {INK_MODES.map((mode) => (
              <Link
                key={mode.name}
                href={mode.href}
                className="relative block border border-amber-500/30 rounded-xl p-6 text-left transition-all hover:border-amber-500 hover:bg-amber-500/5"
              >
                <h3 className="text-xl font-bold text-white mb-1">{mode.name}</h3>
                <p className="text-sm text-gray-400">{mode.description}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Clash — card matchups */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Clash — Cards</h2>
          <div className="grid grid-cols-2 gap-4">
            {CLASH_MODES.map((mode) => (
              <Link
                key={mode.name}
                href={mode.href}
                className={`relative block border rounded-xl p-6 text-left transition-all ${
                  mode.ready
                    ? "border-gray-700 hover:border-amber-500 hover:bg-gray-900/50"
                    : "border-gray-800 opacity-50 pointer-events-none"
                }`}
              >
                <h3 className="text-xl font-bold text-white mb-1">{mode.name}</h3>
                <p className="text-sm text-gray-400">{mode.description}</p>
                {!mode.ready && (
                  <span className="absolute top-3 right-3 text-xs text-gray-600">
                    Soon
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div className="mb-10">
          <div className="grid grid-cols-2 gap-4">
            {TOOLS.map((tool) => (
              <Link
                key={tool.name}
                href={tool.href}
                className={`relative block border rounded-xl p-6 text-left transition-all ${
                  tool.ready
                    ? "border-gray-700 hover:border-amber-500 hover:bg-gray-900/50"
                    : "border-gray-800 opacity-50 pointer-events-none"
                }`}
              >
                <h3 className="text-xl font-bold text-white mb-1">{tool.name}</h3>
                <p className="text-sm text-gray-400">{tool.description}</p>
                {!tool.ready && (
                  <span className="absolute top-3 right-3 text-xs text-gray-600">
                    Soon
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            href="/browse"
            className="px-5 py-2 border border-gray-700 text-gray-300 font-medium rounded-lg hover:border-gray-500 hover:text-white transition-colors"
          >
            Browse Cards
          </Link>
          <Link
            href="/deck"
            className="px-5 py-2 border border-gray-700 text-gray-300 font-medium rounded-lg hover:border-gray-500 hover:text-white transition-colors"
          >
            Deck Explorer
          </Link>
        </div>
      </div>
    </main>
  );
}
