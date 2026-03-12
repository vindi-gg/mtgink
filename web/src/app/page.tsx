import Link from "next/link";
import DailyChallengesSection from "@/components/DailyChallengesSection";
import ModeCards from "@/components/ModeCards";

export const metadata = {
  title: "MTG Ink — Discover & Rank Magic Cards and Art",
  description: "Discover and rank the best Magic: The Gathering cards and art.",
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-2xl">
          <h1 className="text-5xl font-bold mb-4 flex flex-col items-center" style={{ lineHeight: 1.1 }}>
            <span className="tracking-widest">MTG</span>
            <span className="text-amber-400" style={{ letterSpacing: "0.32em" }}>INK</span>
          </h1>
          <p className="text-gray-400 text-lg mb-10">
            Discover and rank the best Magic: The Gathering cards and art.
          </p>

          {/* Daily Challenges */}
          <DailyChallengesSection />

          {/* Modes */}
          <ModeCards />

          <div className="flex gap-4 justify-center">
            <Link
              href="/browse"
              className="px-5 py-2 border border-gray-700 text-gray-300 font-medium rounded-lg hover:border-gray-500 hover:text-white transition-colors"
            >
              Browse Cards
            </Link>
            <Link
              href="/deck"
              className="px-5 py-2 border border-gray-700 text-gray-300 font-medium rounded-lg hover:border-gray-500 hover:text-white transition-colors"
            >
              Deck Explorer
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-800 bg-gray-900/50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="text-[15px] font-bold tracking-[0.08em]">
                <span className="text-gray-400">MTG </span><span className="text-amber-400">INK</span>
              </div>
              <p className="max-w-md text-xs leading-relaxed text-gray-500">
                MTG Ink is an independent fan project and is not affiliated with, endorsed by, or sponsored by Wizards of the Coast, Hasbro, or any of their subsidiaries. Card images and data courtesy of Scryfall.
              </p>
            </div>
            <nav className="flex gap-6 text-xs text-gray-500">
              <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
              <a href="mailto:dan@mtg.ink" className="hover:text-gray-300 transition-colors">Contact</a>
            </nav>
          </div>
          <p className="mt-6 text-[11px] text-gray-600/60">
            &copy; {new Date().getFullYear()} MTG Ink. Card data and images courtesy of Scryfall and Wizards of the Coast.
          </p>
        </div>
      </footer>
    </main>
  );
}
