import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getHomepageMainlineSets,
  getNonDigitalSets,
  getTopIllustrations,
} from "@/lib/queries";
import { websiteJsonLd, JsonLd } from "@/lib/jsonld";
import SetArtPageBody from "@/components/SetArtPageBody";
import SetTileRow from "@/components/SetTileRow";
import type { SetArtSort } from "@/lib/types";

export const revalidate = 60;

export const metadata = {
  title: { absolute: "Full Database of MTG Art - MTG Ink" },
  description: "Browse Magic: The Gathering art by set. Sort by popularity, price, or A-Z across 37,000+ cards.",
  alternates: { canonical: "https://mtg.ink/" },
};

const VALID_SORTS: SetArtSort[] = ["latest", "popularity", "az", "price"];
const HOMEPAGE_INITIAL_LIMIT = 30;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; sort?: string }>;
}) {
  const { set, sort: rawSort } = await searchParams;
  const sort: SetArtSort = VALID_SORTS.includes(rawSort as SetArtSort)
    ? (rawSort as SetArtSort)
    : "popularity";

  // Legacy ?set=foo URLs migrate to /sets/foo
  if (set) {
    const qs = sort !== "popularity" ? `?sort=${sort}` : "";
    redirect(`/sets/${set}${qs}`);
  }

  const [tiles, allSets, page] = await Promise.all([
    getHomepageMainlineSets(8),
    getNonDigitalSets(),
    getTopIllustrations(sort, HOMEPAGE_INITIAL_LIMIT, 0),
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
