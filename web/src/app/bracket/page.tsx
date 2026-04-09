import BracketPageClient from "./BracketPageClient";

export const metadata = {
  title: "Bracket",
  description: "Fill out your MTG art bracket — pick winners in every matchup.",
};

export default function BracketPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <BracketPageClient />
    </main>
  );
}
