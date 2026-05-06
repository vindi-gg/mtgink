import { getNonDigitalSets } from "@/lib/queries";
import SetsBrowseClient from "@/components/SetsBrowseClient";

export const revalidate = 3600;

export const metadata = {
  title: { absolute: "All Sets - MTG Ink" },
  description: "Browse every Magic: The Gathering set, expansion, and product.",
  alternates: { canonical: "https://mtg.ink/sets" },
};

export default async function SetsListPage() {
  const sets = await getNonDigitalSets();

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">All Sets</h1>
        <SetsBrowseClient sets={sets} />
      </div>
    </main>
  );
}
