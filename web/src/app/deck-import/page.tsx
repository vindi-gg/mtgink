import DeckImportClient from "./DeckImportClient";

export const metadata = {
  title: "Import Deck",
  description: "Import a deck from Moxfield and customize card art.",
};

export default function DeckImportPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-6 md:py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-400 mb-1">Import Deck</h1>
        <p className="text-sm text-gray-500 mb-6">
          Paste a Moxfield URL or decklist to see your cards with all available art.
        </p>
        <DeckImportClient />
      </div>
    </main>
  );
}
