import { getClashPair, getSpecificClashPair, resolvePrintingRef, getRandomVsTheme, getRandomCardsByArtist, getRandomCardsByTag, getRandomCardsByArtTag } from "@/lib/queries";
import { getBrewBySlug, incrementPlayCount } from "@/lib/brew-queries";
import ShowdownView from "@/components/ShowdownView";
import type { CompareFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "VS",
  description: "Cards go head to head — pick the winner",
  robots: { index: false, follow: false },
};

export default async function VsPage({
  searchParams,
}: {
  searchParams: Promise<{ colors?: string; type?: string; subtype?: string; set_code?: string; rules_text?: string; a?: string; b?: string; brew?: string; artist?: string; tag?: string; art_tag?: string }>;
}) {
  const { colors, type, subtype, set_code, rules_text, a, b, brew: brewSlug, artist: artistParam, tag, art_tag } = await searchParams;

  let filters: CompareFilters = {};
  let themeLabel: string | undefined;
  let themeType: "artist" | "tag" | "art_tag" | undefined;
  let randomArtist: string | undefined;
  let randomTagId: string | undefined;

  if (brewSlug) {
    const brew = await getBrewBySlug(brewSlug);
    if (brew) {
      incrementPlayCount(brew.id).catch(() => {});
      if (brew.colors?.length) filters.colors = brew.colors;
      if (brew.card_type) filters.type = brew.card_type;
      if (brew.subtype) filters.subtype = brew.subtype;
      if (brew.rules_text) filters.rules_text = brew.rules_text;
      if (brew.source === "expansion") filters.set_code = brew.source_id;
      if (brew.source === "tribe") {
        filters.type = "Creature";
        filters.subtype = brew.source_id;
      }
    }
  } else if (artistParam) {
    themeLabel = artistParam;
    themeType = "artist";
  } else if (tag) {
    themeLabel = tag;
    themeType = "tag";
  } else if (art_tag) {
    themeLabel = art_tag;
    themeType = "art_tag";
  } else if (colors || type || subtype || set_code || rules_text) {
    filters = {
      colors: colors ? colors.split(",").filter(Boolean) : undefined,
      type: type || undefined,
      subtype: subtype || undefined,
      set_code: set_code || undefined,
      rules_text: rules_text || undefined,
    };
  }

  const hasExplicitFilters = Object.keys(filters).length > 0 || !!themeLabel;

  // When no explicit filters, pick a random VS theme so there's always a topic
  if (!hasExplicitFilters && !a && !b) {
    const theme = await getRandomVsTheme();
    if (theme?.tribe) {
      filters = { type: "Creature", subtype: theme.tribe };
    } else if (theme?.set_code) {
      filters = { set_code: theme.set_code };
    } else if (theme?.artist) {
      themeLabel = theme.artist;
      themeType = "artist";
      randomArtist = theme.artist;
    } else if (theme?.tag_id) {
      themeLabel = theme.label;
      themeType = theme.theme_type === "art_tag" ? "art_tag" : "tag";
      randomTagId = theme.tag_id;
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
    // Artist theme — from URL param or random theme pick
    const artistName = artistParam || randomArtist;
    if (!pair && artistName) {
      const oracleIds = await getRandomCardsByArtist(artistName);
      if (oracleIds.length >= 2) {
        pair = await getSpecificClashPair(oracleIds[0], oracleIds[1]);
      }
    }
    // Tag — from URL param or random theme pick
    const tagId = tag || randomTagId;
    if (!pair && tagId) {
      const oracleIds = await getRandomCardsByTag(tagId);
      if (oracleIds.length >= 2) {
        pair = await getSpecificClashPair(oracleIds[0], oracleIds[1]);
      }
    }
    if (!pair && art_tag) {
      const oracleIds = await getRandomCardsByArtTag(art_tag);
      if (oracleIds.length >= 2) {
        pair = await getSpecificClashPair(oracleIds[0], oracleIds[1]);
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
        key={pair.a.oracle_id + pair.b.oracle_id}
        mode="vs"
        initialPair={pair}
        initialFilters={hasFilters ? filters : undefined}
        themeLabel={themeLabel}
        themeType={themeType}
      />
    </main>
  );
}
