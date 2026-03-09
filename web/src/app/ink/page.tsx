import { getComparisonPair } from "@/lib/queries";
import ComparisonView from "@/components/ComparisonView";
import type { CompareFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ink — MTG Ink",
  description: "Compare illustrations of the same card and pick the best art",
};

export default async function InkPage({
  searchParams,
}: {
  searchParams: Promise<{ oracle_id?: string; colors?: string; type?: string; subtype?: string; mode?: string }>;
}) {
  const { oracle_id, colors, type, subtype, mode } = await searchParams;

  const isVs = mode === "vs";

  const filters: CompareFilters = {
    ...(isVs ? { mode: "cross" as const } : {}),
    ...(colors || type || subtype
      ? {
          colors: colors ? colors.split(",").filter(Boolean) : undefined,
          type: type || undefined,
          subtype: subtype || undefined,
        }
      : {}),
  };

  const hasFilters = Object.keys(filters).length > 0;

  let pair;
  try {
    pair = await getComparisonPair(oracle_id, hasFilters ? filters : undefined);
  } catch {
    pair = await getComparisonPair(undefined, isVs ? { mode: "cross" } : undefined);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <ComparisonView
        initialPair={pair}
        initialFilters={hasFilters ? filters : undefined}
        baseUrl="/ink"
        initialSubMode={isVs ? "vs" : "mirror"}
      />
    </main>
  );
}
