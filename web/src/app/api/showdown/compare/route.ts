import { NextRequest, NextResponse } from "next/server";
import { getComparisonPair, getClashPair, getRandomVsTheme, getRandomCardsByArtist, getRandomCardsByTag, getRandomCardsByArtTag, getSpecificClashPair } from "@/lib/queries";
import type { CompareFilters } from "@/lib/types";

function parseFilters(searchParams: URLSearchParams): CompareFilters | undefined {
  const colors = searchParams.get("colors");
  const type = searchParams.get("type");
  const subtype = searchParams.get("subtype");
  const set_code = searchParams.get("set_code");
  const rules_text = searchParams.get("rules_text");

  if (!colors && !type && !subtype && !set_code && !rules_text) return undefined;

  return {
    colors: colors ? colors.split(",").filter(Boolean) : undefined,
    type: type || undefined,
    subtype: subtype || undefined,
    set_code: set_code || undefined,
    rules_text: rules_text || undefined,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("mode") ?? "remix";
  const oracleId = searchParams.get("oracle_id") ?? undefined;
  const filters = parseFilters(searchParams);

  try {
    if (mode === "vs") {
      // random_theme: pick a random VS theme and return theme metadata with the pair
      const randomTheme = searchParams.get("random_theme");
      if (randomTheme && !filters) {
        const themeTypes = searchParams.get("theme_types")?.split(",").filter(Boolean) || undefined;
        const theme = await getRandomVsTheme(themeTypes);
        let themeFilters: CompareFilters | undefined;
        let themeLabel: string | undefined;

        if (theme?.tribe) {
          themeFilters = { type: "Creature", subtype: theme.tribe };
        } else if (theme?.set_code) {
          themeFilters = { set_code: theme.set_code };
        } else if (theme?.artist) {
          themeLabel = theme.artist;
        }

        // For artist/tag/art_tag themes, pick specific card pairs
        let pair;
        if (theme?.artist) {
          const oracleIds = await getRandomCardsByArtist(theme.artist);
          if (oracleIds.length >= 2) pair = await getSpecificClashPair(oracleIds[0], oracleIds[1]);
        } else if (theme?.theme_type === "tag" && theme.tag_id) {
          themeLabel = theme.label.replace(" Gauntlet", "");
          const oracleIds = await getRandomCardsByTag(theme.tag_id);
          if (oracleIds.length >= 2) pair = await getSpecificClashPair(oracleIds[0], oracleIds[1]);
        } else if (theme?.theme_type === "art_tag" && theme.tag_id) {
          themeLabel = theme.label.replace(" Gauntlet", "");
          const oracleIds = await getRandomCardsByArtTag(theme.tag_id);
          if (oracleIds.length >= 2) pair = await getSpecificClashPair(oracleIds[0], oracleIds[1]);
        }
        if (!pair) {
          pair = await getClashPair(themeFilters);
        }

        return NextResponse.json({
          ...pair,
          _theme: { filters: themeFilters, label: themeLabel },
        });
      }

      const pair = await getClashPair(filters);
      return NextResponse.json(pair);
    }

    // Remix: same-card comparison
    const pair = await getComparisonPair(oracleId, filters);
    return NextResponse.json(pair);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get pair" },
      { status: 500 },
    );
  }
}
