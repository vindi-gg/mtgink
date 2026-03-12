import Link from "next/link";

export const metadata = {
  title: "Magic: The Gathering Database — MTG Ink",
  description: "Browse the Magic: The Gathering card database. Explore artists, expansions, creature tribes, tags, and more.",
};

const sections = [
  {
    href: "/artists",
    title: "Artists",
    description: "Browse artists ranked by popularity and illustration count",
  },
  {
    href: "/db/expansions",
    title: "Expansions",
    description: "Browse sets, expansions, and products",
  },
  {
    href: "/db/cards",
    title: "Cards",
    description: "Search all 36,000+ unique cards",
  },
  {
    href: "/db/tribes",
    title: "Tribes",
    description: "Browse creatures by type — Goblins, Elves, Dragons, and more",
  },
  {
    href: "/db/tags",
    title: "Tags",
    description: "Browse cards by Scryfall community tags",
  },
];

export default function DbIndexPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <h1 className="text-3xl font-bold mb-2">Magic: The Gathering Database</h1>
        <p className="text-gray-400 mb-8">
          Browse the complete card database.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="block p-6 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
            >
              <h2 className="text-xl font-bold mb-1">{s.title}</h2>
              <p className="text-gray-400 text-sm">{s.description}</p>
            </Link>
          ))}
        </div>
    </main>
  );
}
