import { getComparisonPair, getSpecificComparisonPair, resolvePrintingRef, getRandomIllustrationsByArtist } from "@/lib/queries";
import { getBrewBySlug, incrementPlayCount } from "@/lib/brew-queries";
import ShowdownView from "@/components/ShowdownView";
import type { CompareFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Remix",
  description: "Same card, different art — pick the best version",
  robots: { index: false, follow: false },
};

export default async function RemixPage({
  searchParams,
}: {
  searchParams: Promise<{ oracle_id?: string; colors?: string; type?: string; subtype?: string; set_code?: string; a?: string; b?: string; brew?: string; artist?: string }>;
}) {
  const { oracle_id, colors, type, subtype, set_code, a, b, brew: brewSlug, artist } = await searchParams;

  let resolvedOracleId = oracle_id;
  let filters: CompareFilters = {};

  if (brewSlug) {
    const brew = await getBrewBySlug(brewSlug);
    if (brew) {
      incrementPlayCount(brew.id).catch(() => {});
      if (brew.source === "card") resolvedOracleId = brew.source_id;
    }
  } else if (colors || type || subtype || set_code) {
    filters = {
      colors: colors ? colors.split(",").filter(Boolean) : undefined,
      type: type || undefined,
      subtype: subtype || undefined,
      set_code: set_code || undefined,
    };
  }

  const hasFilters = Object.keys(filters).length > 0;

  let pair;
  try {
    if (a && b) {
      const [refA, refB] = await Promise.all([resolvePrintingRef(a), resolvePrintingRef(b)]);
      if (refA && refB) {
        pair = await getSpecificComparisonPair(refA.illustration_id, refB.illustration_id);
      }
    }
    if (!pair && artist) {
      const illIds = await getRandomIllustrationsByArtist(artist);
      if (illIds.length >= 2) {
        pair = await getSpecificComparisonPair(illIds[0], illIds[1]);
      }
    }
    if (!pair) {
      pair = await getComparisonPair(resolvedOracleId, hasFilters ? filters : undefined);
    }
  } catch {
    pair = await getComparisonPair();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <ShowdownView
        key={pair.a.illustration_id + pair.b.illustration_id}
        mode="remix"
        initialPair={pair}
        initialFilters={hasFilters ? filters : undefined}
      />
    </main>
  );
}
