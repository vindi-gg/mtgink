import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const admin = getAdminClient();

  // Look up brew by slug
  const { data: brew, error: brewErr } = await admin
    .from("brews")
    .select("id")
    .eq("slug", slug)
    .single();

  if (brewErr || !brew) {
    return NextResponse.json({ error: "Brew not found" }, { status: 404 });
  }

  // Fetch recent results for this brew (last 50)
  const { data: results, error } = await admin
    .from("gauntlet_results")
    .select("id, champion_name, champion_illustration_id, champion_oracle_id, champion_wins, pool_size, completed_at, results")
    .eq("brew_id", brew.id)
    .order("completed_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch results" }, { status: 500 });
  }

  // Compute community stats
  const totalPlays = results?.length ?? 0;

  // Champion frequency — which card wins most often
  const championCounts = new Map<string, { name: string; illustration_id: string; oracle_id: string; count: number; best_wins: number }>();
  for (const r of results ?? []) {
    const key = r.champion_oracle_id;
    const existing = championCounts.get(key);
    if (existing) {
      existing.count++;
      if (r.champion_wins > existing.best_wins) existing.best_wins = r.champion_wins;
    } else {
      championCounts.set(key, {
        name: r.champion_name,
        illustration_id: r.champion_illustration_id,
        oracle_id: r.champion_oracle_id,
        count: 1,
        best_wins: r.champion_wins,
      });
    }
  }

  const topChampions = [...championCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Find the best representative printing for each champion (for image display)
  // Use the illustration_id from the most recent win
  const championPrintings = new Map<string, { set_code: string; collector_number: string }>();
  for (const r of results ?? []) {
    if (!championPrintings.has(r.champion_oracle_id)) {
      // Get set_code/collector_number from the results JSONB
      const entries = r.results as Array<{ oracle_id: string; set_code: string; collector_number: string }>;
      // The champion isn't in results array (they're the winner), but we can look them up
      // from another result entry where this card appeared as a loser
      // Actually easier: query printings table for the illustration
      championPrintings.set(r.champion_oracle_id, { set_code: "", collector_number: "" });
    }
  }

  // Batch fetch printings for champion illustrations
  const illustrationIds = topChampions.map((c) => c.illustration_id);
  const { data: printings } = await admin
    .from("printings")
    .select("illustration_id, set_code, collector_number")
    .in("illustration_id", illustrationIds)
    .limit(illustrationIds.length);

  const printingMap = new Map<string, { set_code: string; collector_number: string }>();
  for (const p of printings ?? []) {
    if (!printingMap.has(p.illustration_id)) {
      printingMap.set(p.illustration_id, { set_code: p.set_code, collector_number: p.collector_number });
    }
  }

  const championsWithPrintings = topChampions.map((c) => ({
    ...c,
    ...(printingMap.get(c.illustration_id) ?? {}),
  }));

  return NextResponse.json({
    total_plays: totalPlays,
    top_champions: championsWithPrintings,
    recent: (results ?? []).slice(0, 10).map((r) => ({
      id: r.id,
      champion_name: r.champion_name,
      champion_wins: r.champion_wins,
      pool_size: r.pool_size,
      completed_at: r.completed_at,
    })),
  });
}
