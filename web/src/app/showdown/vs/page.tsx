import { getClashPair, getSpecificClashPair, resolvePrintingRef, getRandomVsTheme } from "@/lib/queries";
import ShowdownView from "@/components/ShowdownView";
import type { CompareFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "VS — MTG Ink",
  description: "Cards go head to head — pick the winner",
  robots: { index: false, follow: false },
};

export default async function VsPage({
  searchParams,
}: {
  searchParams: Promise<{ colors?: string; type?: string; subtype?: string; set_code?: string; a?: string; b?: string }>;
}) {
  const { colors, type, subtype, set_code, a, b } = await searchParams;

  let filters: CompareFilters = {
    ...(colors || type || subtype || set_code
      ? {
          colors: colors ? colors.split(",").filter(Boolean) : undefined,
          type: type || undefined,
          subtype: subtype || undefined,
          set_code: set_code || undefined,
        }
      : {}),
  };

  const hasExplicitFilters = Object.keys(filters).length > 0;

  // When no explicit filters, pick a random VS theme (tribe) so there's always a topic
  if (!hasExplicitFilters && !a && !b) {
    const theme = await getRandomVsTheme();
    if (theme?.tribe) {
      filters = { subtype: theme.tribe };
    }
  }

  const hasFilters = Object.keys(filters).length > 0;

  let pair;
  try {
    if (a && b) {
      const [refA, refB] = await Promise.all([resolvePrintingRef(a), resolvePrintingRef(b)]);
      if (refA && refB) {
        pair = await getSpecificClashPair(refA.oracle_id, refB.oracle_id);
      }
    }
    if (!pair) {
      pair = await getClashPair(hasFilters ? filters : undefined);
    }
  } catch {
    pair = await getClashPair();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <ShowdownView
        mode="vs"
        initialPair={pair}
        initialFilters={hasFilters ? filters : undefined}
      />
    </main>
  );
}
