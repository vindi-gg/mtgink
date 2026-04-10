import { Suspense } from "react";
import BracketPageClient from "./BracketPageClient";

export const metadata = {
  title: "Bracket",
  description: "Fill out your MTG art bracket — pick winners in every matchup.",
};

// useSearchParams() inside BracketPageClient forces client-side rendering,
// which Next 16 requires to be wrapped in a Suspense boundary during prerender.
export default function BracketPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex items-center gap-2 text-amber-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading bracket...</span>
          </div>
        </div>
      }>
        <BracketPageClient />
      </Suspense>
    </main>
  );
}
