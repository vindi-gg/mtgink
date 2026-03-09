import CardSearch from "@/components/CardSearch";

export const metadata = {
  title: "Browse Cards — MTG Ink",
  description: "Find Magic: The Gathering cards with multiple art versions to compare and rank.",
};

export default function BrowsePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Browse Cards</h1>
        <p className="text-gray-400 mb-6">
          Find cards with multiple art versions to compare and rank.
        </p>
        <CardSearch />
      </div>
    </main>
  );
}
