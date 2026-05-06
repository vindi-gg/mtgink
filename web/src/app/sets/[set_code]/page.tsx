import { notFound } from "next/navigation";
import {
  getHomepageMainlineSets,
  getIllustrationsForSet,
  getNonDigitalSets,
  getSetByCode,
} from "@/lib/queries";
import SetArtPageBody from "@/components/SetArtPageBody";
import SetPickerButton from "@/components/SetPickerButton";
import type { SetArtSort } from "@/lib/types";

export const revalidate = 60;

const VALID_SORTS: SetArtSort[] = ["latest", "popularity", "az", "price"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ set_code: string }>;
}) {
  const { set_code } = await params;
  const set = await getSetByCode(set_code);
  if (!set) return {};
  return {
    title: { absolute: `${set.name} - MTG Art - MTG Ink` },
    description: `Browse ${set.name} (${set.set_code.toUpperCase()}) art. Sort by popularity, price, or A-Z.`,
    alternates: { canonical: `https://mtg.ink/sets/${set.set_code}` },
  };
}

export default async function SetArtPage({
  params,
  searchParams,
}: {
  params: Promise<{ set_code: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { set_code } = await params;
  const { sort: rawSort } = await searchParams;
  const sort: SetArtSort = VALID_SORTS.includes(rawSort as SetArtSort)
    ? (rawSort as SetArtSort)
    : "popularity";

  const [activeSet, tiles, allSets] = await Promise.all([
    getSetByCode(set_code),
    getHomepageMainlineSets(8),
    getNonDigitalSets(),
  ]);

  if (!activeSet) notFound();

  const page = await getIllustrationsForSet(set_code, sort, 60, 0);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
        <h1 className="text-xl md:text-2xl font-bold text-white mb-3">
          {activeSet.name}
          <span className="text-gray-500 font-normal"> · Full Set Art</span>
        </h1>
        <SetArtPageBody
          apiPath={`/api/sets/${set_code}/illustrations`}
          activeSet={activeSet}
          basePath={`/sets/${set_code}`}
          sort={sort}
          page={page}
          headerSlot={
            <SetPickerButton
              activeSet={activeSet}
              latest={tiles}
              allSets={allSets}
              metaText={[
                activeSet.set_code.toUpperCase(),
                activeSet.released_at,
                `${page.total} illustration${page.total === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          }
        />
      </div>
    </main>
  );
}
