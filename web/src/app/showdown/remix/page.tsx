import { getComparisonPair, getSpecificComparisonPair, resolvePrintingRef } from "@/lib/queries";
import ShowdownView from "@/components/ShowdownView";
import type { CompareFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Remix — MTG Ink",
  description: "Same card, different art — pick the best version",
  robots: { index: false, follow: false },
};

export default async function RemixPage({
  searchParams,
}: {
  searchParams: Promise<{ oracle_id?: string; colors?: string; type?: string; subtype?: string; set_code?: string; a?: string; b?: string }>;
}) {
  const { oracle_id, colors, type, subtype, set_code, a, b } = await searchParams;

  const filters: CompareFilters = {
    ...(colors || type || subtype || set_code
      ? {
          colors: colors ? colors.split(",").filter(Boolean) : undefined,
          type: type || undefined,
          subtype: subtype || undefined,
          set_code: set_code || undefined,
        }
      : {}),
  };

  const hasFilters = Object.keys(filters).length > 0;

  let pair;
  try {
    if (a && b) {
      // Resolve short refs (e.g. "ice-64") to illustration IDs
      const [refA, refB] = await Promise.all([resolvePrintingRef(a), resolvePrintingRef(b)]);
      if (refA && refB) {
        pair = await getSpecificComparisonPair(refA.illustration_id, refB.illustration_id);
      }
    }
    if (!pair) {
      pair = await getComparisonPair(oracle_id, hasFilters ? filters : undefined);
    }
  } catch {
    pair = await getComparisonPair();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <ShowdownView
        mode="remix"
        initialPair={pair}
        initialFilters={hasFilters ? filters : undefined}
      />
    </main>
  );
}
