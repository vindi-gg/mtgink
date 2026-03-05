import DbCardSearch from "@/components/DbCardSearch";

export default function DbCardsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Cards</h1>
        <p className="text-gray-400 mb-6">
          Search all 36,000+ unique Magic: The Gathering cards.
        </p>
        <DbCardSearch />
      </div>
    </main>
  );
}
