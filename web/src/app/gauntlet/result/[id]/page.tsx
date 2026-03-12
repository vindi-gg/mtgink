import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getResult(id);
  if (!result) return { title: "Result not found — MTG Ink" };

  const title = `${result.champion_name} wins the gauntlet! — MTG Ink`;
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

  // Champion is the last entry in results array (highest position), or use the top-level fields
  const champion = {
    name: result.champion_name,
    illustration_id: result.champion_illustration_id,
    oracle_id: result.champion_oracle_id,
    wins: result.champion_wins,
    // Find champion's printing info from results
    ...(() => {
      const champEntry = result.results.find(
        (r) => r.illustration_id === result.champion_illustration_id
      );
      return champEntry
        ? { set_code: champEntry.set_code, collector_number: champEntry.collector_number, artist: champEntry.artist }
        : { set_code: "", collector_number: "", artist: "" };
    })(),
  };

  // Sort runner-ups by position descending (highest position = lasted longest)
  const runnerUps = result.results
    .filter((r) => r.illustration_id !== result.champion_illustration_id)
    .sort((a, b) => b.position - a.position);

  const isRemix = result.mode === "remix";
  const label = result.card_name
    ? `${result.card_name} Gauntlet`
    : result.filter_label
      ? `${result.filter_label} Gauntlet`
      : "Gauntlet";

  const date = new Date(result.completed_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
          <h1 className="text-xl font-bold text-amber-400">
            {champion.name} wins!
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {champion.wins} win{champion.wins !== 1 ? "s" : ""} &middot; {result.pool_size} cards &middot; {date}
          </p>
        </div>

        {/* Champion */}
        {champion.set_code && (
          <div className="mb-6">
            <div className="relative ring-2 ring-amber-500/50 rounded-[5%] overflow-hidden">
              <img
                src={artCropUrl(champion.set_code, champion.collector_number, null)}
                alt={champion.name}
                className="w-full"
              />
              <div className="absolute top-2 left-2">
                <span className="text-[10px] font-bold uppercase text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  Champion
                </span>
              </div>
              <div className="absolute bottom-2 right-2 text-right">
                <span className="text-xs font-bold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {champion.name}
                </span>
                <p className="text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {champion.artist}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Runner-ups */}
        {runnerUps.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-500 mb-2 text-center uppercase">Results</h3>
            <div className="space-y-1">
              {runnerUps.map((r, i) => (
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
                    <span className="text-sm text-gray-200 truncate block">
                      {isRemix ? r.artist : r.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {isRemix ? r.set_code.toUpperCase() : r.artist}
                      {r.wins > 0 && ` \u00b7 ${r.wins} win${r.wins !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="flex justify-center gap-3">
          <a
            href="/showdown/gauntlet"
            className="px-5 py-2 text-sm font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
          >
            Try a Gauntlet
          </a>
        </div>
      </div>
    </main>
  );
}
