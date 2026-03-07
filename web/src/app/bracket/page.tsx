import { getRandomBracketCards } from "@/lib/bracket";
import BracketView from "@/components/BracketView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Art Bracket — MTG Ink",
  description: "32-card single-elimination art tournament",
};

export default function BracketPage() {
  const cards = getRandomBracketCards(32);
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <BracketView initialCards={cards} />
    </main>
  );
}
