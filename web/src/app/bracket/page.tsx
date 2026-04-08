import { getRandomBracketCards } from "@/lib/bracket";
import BracketFillView from "@/components/BracketFillView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bracket",
  description: "Fill out your MTG art bracket — pick winners in every matchup.",
};

export default async function BracketPage() {
  const cards = await getRandomBracketCards(8);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <BracketFillView cards={cards} />
    </main>
  );
}
