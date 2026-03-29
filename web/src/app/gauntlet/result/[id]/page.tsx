import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";
import RecentActivity from "@/components/RecentActivity";
import type { Metadata } from "next";

interface GauntletResultEntry {
  oracle_id: string;
  illustration_id: string;
  name: string;
  artist: string;
  set_code: string;
  collector_number: string;
  wins: number;
  position: number;
  slug?: string;
  set_name?: string;
}

interface GauntletResultRow {
  id: number;
  mode: string;
  pool_size: number;
  champion_oracle_id: string;
  champion_illustration_id: string;
  champion_name: string;
  champion_wins: number;
  results: GauntletResultEntry[];
  card_name: string | null;
  filter_label: string | null;
  completed_at: string;
}

async function getResult(id: string): Promise<GauntletResultRow | null> {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  const { data } = await getAdminClient()
    .from("gauntlet_results")
    .select("id, mode, pool_size, champion_oracle_id, champion_illustration_id, champion_name, champion_wins, results, card_name, filter_label, completed_at")
    .eq("id", numId)
    .maybeSingle();
  return data as GauntletResultRow | null;
}

async function getSlugs(oracleIds: string[]): Promise<Record<string, { slug: string; set_name?: string }>> {
  if (!oracleIds.length) return {};
  const { data } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, slug")
    .in("oracle_id", oracleIds);
  const map: Record<string, { slug: string }> = {};
  for (const row of data ?? []) {
    map[row.oracle_id] = { slug: row.slug };
  }
  return map;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getResult(id);
  if (!result) return { title: "Result not found" };

  const title = `${result.champion_name} wins the gauntlet!`;
  const description = `${result.champion_name} went ${result.champion_wins}-0 in a ${result.pool_size}-card gauntlet on MTG Ink`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "MTG Ink",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function GauntletResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getResult(id);
  if (!result) notFound();

  // Look up slugs for all cards
  const oracleIds = [...new Set(result.results.map((r) => r.oracle_id))];
  const slugMap = await getSlugs(oracleIds);

  // Champion info
  const champEntry = result.results.find(
    (r) => r.illustration_id === result.champion_illustration_id
  );
  const champion = {
    name: result.champion_name,
    illustration_id: result.champion_illustration_id,
    oracle_id: result.champion_oracle_id,
    wins: result.champion_wins,
    set_code: champEntry?.set_code ?? "",
    collector_number: champEntry?.collector_number ?? "",
    artist: champEntry?.artist ?? "",
    slug: slugMap[result.champion_oracle_id]?.slug,
  };

  // Sort runner-ups by position descending (highest position = lasted longest)
  const runnerUps = result.results
    .filter((r) => r.illustration_id !== result.champion_illustration_id)
    .sort((a, b) => b.position - a.position);

  const isRemix = result.mode === "remix";

  function capitalize(s: string): string {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const title = result.card_name
    ? `${result.card_name} Gauntlet`
    : result.filter_label
      ? `${capitalize(result.filter_label)} Gauntlet`
      : "Gauntlet";

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-2 md:py-8">
      <div className="md:flex md:gap-6 md:max-w-7xl md:mx-auto">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <h2 className="font-bold text-center mb-1 text-base md:text-lg">
            <span className="text-amber-400">{title}</span>
            <span className="text-gray-400"> — Complete!</span>
          </h2>

          {/* Champion */}
          {champion.set_code && (
            <div className="max-w-xs mx-auto mb-6 mt-4">
              <div className="text-center mb-2">
                <span className="text-xs font-bold text-amber-500 uppercase">Champion</span>
                <span className="text-xs text-gray-500 ml-2">
                  {champion.wins} win{champion.wins !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="relative ring-2 ring-amber-500/50 rounded-[5%] overflow-hidden">
                <img
                  src={artCropUrl(champion.set_code, champion.collector_number, null)}
                  alt={champion.name}
                  className="w-full"
                />
              </div>
              <div className="text-center mt-2">
                {champion.slug ? (
                  <a
                    href={`/card/${champion.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-amber-400 hover:text-amber-300"
                  >
                    {champion.name}
                  </a>
                ) : (
                  <span className="text-sm font-bold text-amber-400">{champion.name}</span>
                )}
                <p className="text-xs text-gray-400">
                  {champion.artist} &middot; {champion.set_code.toUpperCase()}
                </p>
              </div>
            </div>
          )}

          {/* Results list */}
          {runnerUps.length > 0 && (
            <div className="max-w-md mx-auto mb-6">
              <h3 className="text-xs font-bold text-gray-500 mb-2 text-center uppercase">Results</h3>
              <div className="space-y-1">
                {runnerUps.map((r, i) => {
                  const slug = slugMap[r.oracle_id]?.slug;
                  return (
                    <div
                      key={`${r.illustration_id}-${r.position}`}
                      className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-3 py-2"
                    >
                      <span className="text-xs text-gray-600 w-5 text-right font-mono">
                        #{i + 2}
                      </span>
                      <img
                        src={artCropUrl(r.set_code, r.collector_number, null)}
                        alt={r.name}
                        className="w-10 h-10 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        {slug ? (
                          <a
                            href={`/card/${slug}`}
                            className="text-sm text-gray-200 hover:text-amber-400 truncate block"
                          >
                            {isRemix ? r.artist : r.name}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-200 truncate block">
                            {isRemix ? r.artist : r.name}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {isRemix ? r.set_code.toUpperCase() : r.artist}
                          {r.wins > 0 && ` \u00b7 ${r.wins} win${r.wins !== 1 ? "s" : ""}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mobile actions */}
          <div className="flex flex-wrap justify-center gap-3 md:hidden">
            <a
              href="/showdown/gauntlet"
              className="block w-full px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors text-center cursor-pointer"
            >
              New Theme
            </a>
          </div>
          <div className="md:hidden">
            <RecentActivity />
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden md:block w-[300px] flex-shrink-0">
          <div className="sticky top-20 space-y-4">
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 space-y-2">
              {champion.slug && (
                <a
                  href={`/card/${champion.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 hover:bg-gray-800 hover:text-amber-400 transition-colors rounded-lg"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View {champion.name}
                </a>
              )}
              <a
                href="/showdown/gauntlet"
                className="block w-full px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors text-center cursor-pointer"
              >
                New Theme
              </a>
            </div>
            <RecentActivity />
          </div>
        </aside>
      </div>
    </main>
  );
}
