import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Giveaway Rules — MTG Ink",
  description: "MTG Ink giveaway rules and information.",
};

export default function GiveawayRulesPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12 text-zinc-300">
      <h1 className="text-2xl font-bold text-white mb-6">Giveaways</h1>
      <p className="text-gray-400">Stay tuned for upcoming giveaways.</p>
    </main>
  );
}
