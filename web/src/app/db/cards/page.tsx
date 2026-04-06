import { getTopCardsBoth } from "@/lib/queries";
import DbCardSearch from "@/components/DbCardSearch";
import TopCardsListClient from "@/components/TopCardsListClient";

export const revalidate = 3600;

export const metadata = {
  title: "Cards",
  description: "Top MTG cards by popularity and number of prints.",
  alternates: { canonical: "https://mtg.ink/db/cards" },
};

export default async function DbCardsPage() {
  const { popular, prints, total } = await getTopCardsBoth(500);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
      <h1 className="text-3xl font-bold mb-1">Cards</h1>

      {/* Search */}
      <div className="mb-6">
        <DbCardSearch />
      </div>

      <TopCardsListClient popular={popular} prints={prints} total={total} />
    </main>
  );
}
