import { getClashPair, getSpecificClashPair } from "@/lib/queries";
import ClashView from "@/components/ClashView";
import type { CompareFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Clash — MTG Ink",
  description: "Cards go head-to-head — pick the winner",
};

export default async function ClashPage({
  searchParams,
}: {
  searchParams: Promise<{ colors?: string; type?: string; subtype?: string; a?: string; b?: string }>;
}) {
  const { colors, type, subtype, a, b } = await searchParams;

  const filters: CompareFilters | undefined =
    colors || type || subtype
      ? {
          colors: colors ? colors.split(",").filter(Boolean) : undefined,
          type: type || undefined,
          subtype: subtype || undefined,
        }
      : undefined;

  let pair;
  try {
    if (a && b) {
      pair = await getSpecificClashPair(a, b);
    }
    if (!pair) {
      pair = await getClashPair(filters);
    }
  } catch {
    pair = await getClashPair();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <ClashView initialPair={pair} initialFilters={filters} />
    </main>
  );
}
