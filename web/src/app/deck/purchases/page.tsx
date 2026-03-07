"use client";

import Link from "next/link";
import PurchaseList from "@/components/PurchaseList";

export default function PurchasesPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase List</h1>
          <p className="text-gray-400 text-sm mt-1">
            Cards marked &quot;To Buy&quot; across all your decks.
          </p>
        </div>
        <Link
          href="/deck"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Back to decks
        </Link>
      </div>
      <PurchaseList />
    </main>
  );
}
