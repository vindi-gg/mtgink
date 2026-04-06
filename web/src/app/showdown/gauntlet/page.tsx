import {
  getCardByOracleId,
  getGauntletIllustrations,
  getGauntletIllustrationsByArtist,
  getGauntletCardsByTag,
  getGauntletCards,
  getGauntletIllustrationsBySet,
  getRandomGauntletCard,
  getRandomGauntletGroup,
  getRandomTheme,
  getTheme,
  getArtistBySlug,
  getTagBySlug,
  getTagById,
} from "@/lib/queries";
import { getBrewBySlug, incrementPlayCount } from "@/lib/brew-queries";
import GauntletView from "@/components/GauntletView";
import type { CompareFilters, GauntletEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gauntlet",
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
    art_tag?: string;
    theme?: string;
    theme_types?: string;
    rules_text?: string;
    brew?: string;
  }>;
}) {
  const { oracle_id, colors, type, subtype, set_code, count, mode, artist, tag, art_tag, theme: themeId, theme_types, rules_text, brew: brewSlug } = await searchParams;
  const allowedThemeTypes = theme_types?.split(",").filter(Boolean);

  const poolSize = Math.min(parseInt(count ?? String(DEFAULT_POOL_SIZE)), 50);

  let pool: GauntletEntry[] = [];
  let cardName: string | undefined;
  let filterLabel: string | undefined;
  let gauntletMode: "remix" | "vs" = "vs";
  let filters: CompareFilters | undefined;
  let themeName: string | undefined;
  let brewId: string | undefined;
  let tagId: string | undefined;
  let tagSlug: string | undefined;
  let tagType: "oracle" | "illustration" | undefined;

  try {
    if (brewSlug) {
      // Brew — use snapshotted pool (frozen at creation time)
      const brew = await getBrewBySlug(brewSlug);
      if (brew) {
        brewId = brew.id;
        incrementPlayCount(brew.id).catch(() => {}); // fire and forget
        filterLabel = brew.source_label;
        gauntletMode = brew.source === "card" || brew.source === "artist" ? "remix" : "vs";

        if (brew.source === "card") {
          const card = await getCardByOracleId(brew.source_id);
          cardName = card?.name;
        }

        // Always reconstruct filters from brew metadata for +10 more
        const brewFilters: CompareFilters = {
          colors: brew.colors ?? undefined,
          type: brew.card_type ?? undefined,
          subtype: brew.subtype ?? undefined,
          rules_text: brew.rules_text ?? undefined,
        };
        if (brew.source === "expansion") brewFilters.set_code = brew.source_id;
        if (brew.source === "tribe") {
          brewFilters.type = "Creature";
          brewFilters.subtype = brew.source_id;
        }
        filters = brewFilters;

        if (brew.pool?.length) {
          // Use the snapshotted pool — consistent across plays
          pool = brew.pool;
        } else {
          // Legacy brews without a snapshot — resolve dynamically
          const ps = brew.pool_size ?? DEFAULT_POOL_SIZE;

          if (brew.source === "card") {
            pool = await getGauntletIllustrations(brew.source_id);
          } else if (brew.source === "artist") {
            pool = await getGauntletIllustrationsByArtist(brew.source_id, ps);
          } else if (brew.source === "tag") {
            pool = await getGauntletCardsByTag(brew.source_id, ps * 5);
            if (brew.colors?.length || brew.card_type || brew.subtype || brew.rules_text) {
              pool = pool.filter((entry) => {
                if (brew.colors?.length && entry.mana_cost) {
                  if (!brew.colors.every((c) => entry.mana_cost?.includes(`{${c}}`))) return false;
                }
                if (brew.card_type && entry.type_line && !entry.type_line.includes(brew.card_type)) return false;
                if (brew.subtype && entry.type_line && !entry.type_line.includes(brew.subtype)) return false;
                return true;
              });
            }
            pool = pool.sort(() => Math.random() - 0.5).slice(0, ps);
          } else {
            pool = await getGauntletCards(ps, brewFilters);
          }
        }
      }
    } else if (oracle_id) {
      // Specific card — remix gauntlet
      const card = await getCardByOracleId(oracle_id);
      cardName = card?.name;
      pool = await getGauntletIllustrations(oracle_id);
      gauntletMode = "remix";
    } else if (themeId) {
      // Specific theme by ID
      const t = await getTheme(parseInt(themeId));
      if (t) {
        themeName = t.label;
        gauntletMode = t.pool_mode;
        if (t.theme_type === "card_remix" && t.oracle_id) {
          const card = await getCardByOracleId(t.oracle_id);
          cardName = card?.name;
          pool = await getGauntletIllustrations(t.oracle_id);
        } else if (t.theme_type === "tribe" && t.tribe) {
          filterLabel = t.tribe;
          pool = await getGauntletCards(poolSize, { type: "Creature", subtype: t.tribe });
        } else if (t.theme_type === "tag" && t.tag_id) {
          tagId = t.tag_id;
          filterLabel = t.label.replace(" Gauntlet", "");
          const tagObj = await getTagById(t.tag_id);
          if (tagObj) {
            tagSlug = tagObj.slug;
            tagType = tagObj.type as "oracle" | "illustration";
          }
          pool = await getGauntletCardsByTag(t.tag_id, poolSize);
        } else if (t.theme_type === "artist" && t.artist) {
          filterLabel = t.artist;
          pool = await getGauntletIllustrationsByArtist(t.artist, poolSize);
        } else if (t.theme_type === "set" && t.set_code) {
          filterLabel = t.set_code.toUpperCase();
          filters = { set_code: t.set_code };
          pool = await getGauntletIllustrationsBySet(t.set_code, poolSize);
        }
      }
    } else if (mode === "card") {
      // Random card with 3+ illustrations
      const card = await getRandomGauntletCard();
      if (card) {
        cardName = card.name;
        pool = await getGauntletIllustrations(card.oracle_id);
        gauntletMode = "remix";
      }
    } else if (artist) {
      // Artist gauntlet — resolve slug to real name if needed
      let artistName = artist;
      const resolved = await getArtistBySlug(artist);
      if (resolved) artistName = resolved.name;
      filterLabel = artistName;
      pool = await getGauntletIllustrationsByArtist(artistName, poolSize);
      gauntletMode = "remix";
    } else if (tag) {
      // Tag gauntlet — resolve slug to tag_id if needed
      let resolvedTagId = tag;
      const resolvedTag = await getTagBySlug(tag);
      if (resolvedTag) {
        resolvedTagId = resolvedTag.tag_id;
        filterLabel = resolvedTag.label;
        tagSlug = resolvedTag.slug;
        tagType = resolvedTag.type as "oracle" | "illustration";
      } else {
        filterLabel = tag;
      }
      tagId = resolvedTagId;
      pool = await getGauntletCardsByTag(resolvedTagId, poolSize);
    } else if (art_tag) {
      // Art tag gauntlet — resolve slug to tag_id if needed
      let resolvedTagId = art_tag;
      const resolvedTag = await getTagBySlug(art_tag);
      if (resolvedTag) {
        resolvedTagId = resolvedTag.tag_id;
        filterLabel = resolvedTag.label;
        tagSlug = resolvedTag.slug;
        tagType = resolvedTag.type as "oracle" | "illustration";
      } else {
        filterLabel = art_tag;
      }
      tagId = resolvedTagId;
      pool = await getGauntletCardsByTag(resolvedTagId, poolSize);
    } else if (mode === "group") {
      // Random creature tribe with 10+ cards
      const group = await getRandomGauntletGroup();
      if (group) {
        filters = { type: "Creature", subtype: group.subtype };
        filterLabel = group.label;
        pool = await getGauntletCards(poolSize, filters);
      }
    } else if (set_code && !colors && !type && !subtype && !rules_text) {
      // Set-only filter — use illustration-based query (includes alt art)
      filterLabel = set_code.toUpperCase();
      filters = { set_code };
      pool = await getGauntletIllustrationsBySet(set_code, poolSize);
    } else if (colors || type || subtype || set_code || rules_text) {
      // Explicit filters (mixed)
      const explicitFilters: CompareFilters = {
        colors: colors ? colors.split(",").filter(Boolean) : undefined,
        type: type || undefined,
        rules_text: rules_text || undefined,
        subtype: subtype || undefined,
        set_code: set_code || undefined,
      };
      filters = explicitFilters;
      filterLabel = (subtype ? subtype.charAt(0).toUpperCase() + subtype.slice(1) : undefined) || type || (set_code ? set_code.toUpperCase() : undefined);
      pool = await getGauntletCards(poolSize, explicitFilters);
    } else {
      // No params — pick a random theme
      const t = await getRandomTheme(allowedThemeTypes);
      if (t) {
        themeName = t.label;
        gauntletMode = t.pool_mode;
        if (t.theme_type === "card_remix" && t.oracle_id) {
          const card = await getCardByOracleId(t.oracle_id);
          cardName = card?.name;
          pool = await getGauntletIllustrations(t.oracle_id);
        } else if (t.theme_type === "tribe" && t.tribe) {
          filterLabel = t.tribe;
          pool = await getGauntletCards(poolSize, { type: "Creature", subtype: t.tribe });
        } else if (t.theme_type === "tag" && t.tag_id) {
          tagId = t.tag_id;
          filterLabel = t.label.replace(" Gauntlet", "");
          const tagObj = await getTagById(t.tag_id);
          if (tagObj) {
            tagSlug = tagObj.slug;
            tagType = tagObj.type as "oracle" | "illustration";
          }
          pool = await getGauntletCardsByTag(t.tag_id, poolSize);
        } else if (t.theme_type === "artist" && t.artist) {
          filterLabel = t.artist;
          pool = await getGauntletIllustrationsByArtist(t.artist, poolSize);
        } else {
          pool = await getGauntletCards(poolSize);
        }
      } else {
        // Fallback: random VS
        pool = await getGauntletCards(poolSize);
      }
    }
  } catch (err) {
    console.error("Gauntlet pool load failed:", err);
    pool = [];
  }

  // If pool is empty on an unfiltered request, retry once (transient DB failure / cold start)
  if ((!pool || pool.length < 2) && !oracle_id && !artist && !tag && !themeId && !brewSlug && !colors && !type && !subtype && !set_code && !rules_text && mode !== "card" && mode !== "group") {
    try {
      pool = await getGauntletCards(poolSize);
    } catch {
      pool = [];
    }
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
        tag={tagId}
        tagSlug={tagSlug}
        tagType={tagType}
        themeName={themeName}
        brewId={brewId}
      />
    </main>
  );
}
