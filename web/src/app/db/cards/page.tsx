import DbCardSearch from "@/components/DbCardSearch";

export const metadata = {
  title: "Card Search — MTG Ink",
  description: "Search all Magic: The Gathering cards in the database.",
};

export default function DbCardsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
        <h1 className="text-3xl font-bold mb-2">Cards</h1>
        <p className="text-gray-400 mb-6">
          Search all 36,000+ unique Magic: The Gathering cards.
        </p>
        <DbCardSearch />
    </main>
  );
}
