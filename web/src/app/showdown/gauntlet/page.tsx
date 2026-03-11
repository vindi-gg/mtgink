import {
  getCardByOracleId,
  getGauntletIllustrations,
  getGauntletIllustrationsByArtist,
  getGauntletCardsByTag,
  getGauntletCards,
  getRandomGauntletCard,
  getRandomGauntletGroup,
} from "@/lib/queries";
import GauntletView from "@/components/GauntletView";
import type { CompareFilters, GauntletEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gauntlet — MTG Ink",
  description: "King of the hill — winner stays, faces the next challenger",
  robots: { index: false, follow: false },
};

const DEFAULT_POOL_SIZE = 10;

export default async function GauntletPage({
  searchParams,
}: {
  searchParams: Promise<{
    oracle_id?: string;
    colors?: string;
    type?: string;
    subtype?: string;
    set_code?: string;
    count?: string;
    mode?: string;
    artist?: string;
    tag?: string;
  }>;
}) {
  const { oracle_id, colors, type, subtype, set_code, count, mode, artist, tag } = await searchParams;

  const poolSize = Math.min(parseInt(count ?? String(DEFAULT_POOL_SIZE)), 50);

  let pool: GauntletEntry[] = [];
  let cardName: string | undefined;
  let filterLabel: string | undefined;
  let gauntletMode: "remix" | "vs" = "vs";
  let filters: CompareFilters | undefined;

  try {
    if (oracle_id) {
      // Specific card — remix gauntlet
      const card = await getCardByOracleId(oracle_id);
      cardName = card?.name;
      pool = await getGauntletIllustrations(oracle_id);
      gauntletMode = "remix";
    } else if (mode === "card") {
      // Random card with 3+ illustrations
      const card = await getRandomGauntletCard();
      if (card) {
        cardName = card.name;
        pool = await getGauntletIllustrations(card.oracle_id);
        gauntletMode = "remix";
      }
    } else if (artist) {
      // Artist gauntlet — all illustrations by this artist
      filterLabel = artist;
      pool = await getGauntletIllustrationsByArtist(artist, poolSize);
      gauntletMode = "remix";
    } else if (tag) {
      // Tag gauntlet — cards with this tag
      filterLabel = tag;
      pool = await getGauntletCardsByTag(tag, poolSize);
    } else if (mode === "group") {
      // Random creature tribe with 10+ cards
      const group = await getRandomGauntletGroup();
      if (group) {
        filters = { type: "Creature", subtype: group.subtype };
        filterLabel = group.label;
        pool = await getGauntletCards(poolSize, filters);
      }
    } else {
      // Explicit filters or random VS
      const explicitFilters: CompareFilters = {
        ...(colors || type || subtype || set_code
          ? {
              colors: colors ? colors.split(",").filter(Boolean) : undefined,
              type: type || undefined,
              subtype: subtype || undefined,
              set_code: set_code || undefined,
            }
          : {}),
      };
      const hasFilters = Object.keys(explicitFilters).length > 0;

      if (hasFilters) {
        filters = explicitFilters;
        filterLabel = subtype || type || (set_code ? set_code.toUpperCase() : undefined);
      }

      pool = await getGauntletCards(poolSize, hasFilters ? explicitFilters : undefined);
    }
  } catch {
    pool = [];
  }

  if (!pool || pool.length < 2) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-3">Not enough cards</h1>
          <p className="text-gray-400 mb-4 text-sm">
            {gauntletMode === "remix"
              ? "This card only has one art version."
              : "Not enough cards match these filters for a gauntlet."}
          </p>
          <a
            href="/showdown/gauntlet"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
          >
            Random Gauntlet
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <GauntletView
        mode={gauntletMode}
        pool={pool}
        cardName={cardName}
        filterLabel={filterLabel}
        filters={filters}
      />
    </main>
  );
}
