import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getHomepageMainlineSets,
  getNonDigitalSets,
  getTopIllustrations,
} from "@/lib/queries";
import { getAdminClient } from "@/lib/supabase/admin";
import { websiteJsonLd, JsonLd } from "@/lib/jsonld";
import SetArtPageBody from "@/components/SetArtPageBody";
import SetTileRow from "@/components/SetTileRow";
import DailyChallengeMini from "@/components/DailyChallengeMini";
import type { DailyChallenge, SetArtSort } from "@/lib/types";

export const revalidate = 60;

export const metadata = {
  title: { absolute: "Full Database of MTG Art - MTG Ink" },
  description: "Browse Magic: The Gathering art by set. Sort by popularity, price, or A-Z across 37,000+ cards.",
  alternates: { canonical: "https://mtg.ink/" },
};

const VALID_SORTS: SetArtSort[] = ["latest", "popularity", "az", "price"];
const HOMEPAGE_INITIAL_LIMIT = 30;

/** Fetch today's bracket + gauntlet for the homepage mini row.
 *  Auto-generates if missing (same pattern as /play). Returns at most one
 *  of each type, ordered bracket-then-gauntlet. */
async function fetchTodaysHeadlineChallenges(): Promise<DailyChallenge[]> {
  try {
    const admin = getAdminClient();
    const today = new Date().toISOString().split("T")[0];
    const select = "*";

    let { data: rows } = await admin
      .from("daily_challenges")
      .select(select)
      .eq("challenge_date", today)
      .in("challenge_type", ["bracket", "gauntlet"]);

    if (!rows || rows.length < 2) {
      await admin.rpc("generate_daily_challenges", { p_date: today });
      const refetched = await admin
        .from("daily_challenges")
        .select(select)
        .eq("challenge_date", today)
        .in("challenge_type", ["bracket", "gauntlet"]);
      rows = refetched.data;
    }

    const list = (rows ?? []) as DailyChallenge[];
    const order: Record<string, number> = { bracket: 0, gauntlet: 1 };
    return list.sort((a, b) => (order[a.challenge_type] ?? 9) - (order[b.challenge_type] ?? 9));
  } catch {
    return [];
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; sort?: string; version?: string; exp?: string }>;
}) {
  const { set, sort: rawSort, version: rawVersion, exp: rawExp } = await searchParams;
  const sort: SetArtSort = VALID_SORTS.includes(rawSort as SetArtSort)
    ? (rawSort as SetArtSort)
    : "popularity";
  const version: "v1" | "v2" =
    rawVersion === "v2" ? "v2"
    : rawVersion === "v1" ? "v1"
    : process.env.POPULAR_SORT_VERSION === "v2" ? "v2"
    : "v1";
  const expNum = rawExp != null ? Number(rawExp) : NaN;
  const shareExponent =
    Number.isFinite(expNum) && expNum >= 0 && expNum <= 1 ? expNum : undefined;

  // Legacy ?set=foo URLs migrate to /sets/foo
  if (set) {
    const qs = sort !== "popularity" ? `?sort=${sort}` : "";
    redirect(`/sets/${set}${qs}`);
  }

  const [tiles, allSets, page, dailies] = await Promise.all([
    getHomepageMainlineSets(8),
    getNonDigitalSets(),
    getTopIllustrations(sort, HOMEPAGE_INITIAL_LIMIT, 0, version, shareExponent),
    fetchTodaysHeadlineChallenges(),
  ]);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <JsonLd data={websiteJsonLd()} />
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
        <div className="flex flex-col items-center text-center mb-6 md:mb-8">
          <h1 className="font-bold flex flex-col items-center" style={{ lineHeight: 0.9, fontFamily: "'Futura', 'Futura Bold', 'Trebuchet MS', Arial, sans-serif" }}>
            <span className="text-2xl md:text-3xl tracking-[0.25em] text-white">MTG</span>
            <span className="text-5xl md:text-6xl text-amber-400 tracking-wide">INK</span>
          </h1>
          <p className="text-gray-400 text-sm md:text-base mt-3 max-w-xl">
            Browse art by set. <Link href="/play" className="text-amber-400 hover:text-amber-300">Play</Link> head-to-head matchups, brackets, and daily challenges.
          </p>
        </div>

        {dailies.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {dailies.map((c) => (
              <DailyChallengeMini key={c.id} challenge={c} />
            ))}
          </div>
        )}

        {tiles.length > 0 && (
          <SetTileRow
            tiles={tiles}
            allSets={allSets}
            activeSetCode=""
          />
        )}

        <SetArtPageBody
          apiPath="/api/illustrations"
          basePath="/"
          sort={sort}
          page={page}
          heading="Popular & New"
        />
      </div>
    </main>
  );
}
