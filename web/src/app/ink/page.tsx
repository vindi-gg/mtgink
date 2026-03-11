import { getComparisonPair, getSpecificComparisonPair } from "@/lib/queries";
import ComparisonView from "@/components/ComparisonView";
import type { CompareFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ink — MTG Ink",
  description: "Compare illustrations of the same card and pick the best art",
  robots: { index: false, follow: false },
};

export default async function InkPage({
  searchParams,
}: {
  searchParams: Promise<{ oracle_id?: string; colors?: string; type?: string; subtype?: string; set_code?: string; mode?: string; a?: string; b?: string }>;
}) {
  const { oracle_id, colors, type, subtype, set_code, mode, a, b } = await searchParams;

  const isVs = mode === "vs";

  const filters: CompareFilters = {
    ...(isVs ? { mode: "cross" as const } : {}),
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
    // Specific matchup via share link
    if (a && b) {
      pair = await getSpecificComparisonPair(a, b);
    }
    if (!pair) {
      pair = await getComparisonPair(oracle_id, hasFilters ? filters : undefined);
    }
  } catch {
    pair = await getComparisonPair(undefined, isVs ? { mode: "cross" } : undefined);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <ComparisonView
        initialPair={pair}
        initialFilters={hasFilters ? filters : undefined}
        baseUrl="/ink"
        initialSubMode={isVs ? "vs" : "mirror"}
      />
    </main>
  );
}
