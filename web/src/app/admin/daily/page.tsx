import type { Metadata } from "next";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";
import Link from "next/link";

export const metadata: Metadata = { title: "Daily Challenge Preview", robots: "noindex" };
export const dynamic = "force-dynamic";

interface PoolEntry {
  oracle_id: string;
  illustration_id: string;
  name: string;
  slug: string;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_version: string | null;
  type_line: string | null;
  mana_cost: string | null;
}

interface Challenge {
  id: number;
  challenge_date: string;
  challenge_type: string;
  pool: PoolEntry[] | null;
  gauntlet_mode: string | null;
  theme_id: number | null;
  title: string;
  description: string | null;
  preview_set_code: string | null;
  preview_collector_number: string | null;
  preview_image_version: string | null;
}

async function generateAndFetch(days: number): Promise<Challenge[]> {
  const supabase = getAdminClient();

  // Generate challenges for the next N days
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    await supabase.rpc("generate_daily_challenges", { p_date: dateStr });
  }

  // Fetch all challenges in range
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + days - 1);

  const { data } = await supabase
    .from("daily_challenges")
    .select("*")
    .gte("challenge_date", today.toISOString().split("T")[0])
    .lte("challenge_date", endDate.toISOString().split("T")[0])
    .order("challenge_date", { ascending: true })
    .order("challenge_type", { ascending: true });

  return (data as Challenge[]) ?? [];
}

export default async function AdminDailyPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysParam ?? "30", 10) || 30, 1), 60);
  const challenges = await generateAndFetch(days);

  // Group by date
  const byDate = new Map<string, Challenge[]>();
  for (const c of challenges) {
    const existing = byDate.get(c.challenge_date) ?? [];
    existing.push(c);
    byDate.set(c.challenge_date, existing);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8 px-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Daily Challenge Preview</h1>
          <p className="text-gray-400 text-sm mt-1">
            Next {days} days of generated challenges
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {[7, 14, 30, 60].map((d) => (
            <Link
              key={d}
              href={`/admin/daily?days=${d}`}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                d === days
                  ? "bg-amber-500 text-black font-medium"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {Array.from(byDate.entries()).map(([date, dayChallenges]) => {
          const isToday = date === today;
          const dateObj = new Date(date + "T12:00:00");
          const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
          const dateLabel = dateObj.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={date}
              className={`border rounded-xl p-4 ${
                isToday
                  ? "border-amber-500/50 bg-amber-500/5"
                  : "border-gray-800 bg-gray-900/50"
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="text-sm font-medium">
                  <span className={isToday ? "text-amber-400" : "text-gray-400"}>
                    {dayName}
                  </span>{" "}
                  <span className="text-white">{dateLabel}</span>
                  {isToday && (
                    <span className="ml-2 text-xs bg-amber-500 text-black px-1.5 py-0.5 rounded">
                      TODAY
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {dayChallenges.map((c) => (
                  <div
                    key={c.id}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        {c.challenge_type}
                      </span>
                      {c.gauntlet_mode && (
                        <span className="text-xs text-gray-500">
                          mode: {c.gauntlet_mode}
                        </span>
                      )}
                      <span className="text-sm font-medium text-white ml-1">
                        {c.title}
                      </span>
                    </div>

                    {c.description && (
                      <p className="text-xs text-gray-500 mb-3">{c.description}</p>
                    )}

                    {/* Gauntlet: show pool grid */}
                    {c.pool && c.pool.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">
                          {c.pool.length} cards in pool
                          {c.pool[0].artist && c.pool.every((p) => p.artist === c.pool![0].artist) && (
                            <span className="text-gray-400"> — all by {c.pool[0].artist}</span>
                          )}
                        </p>
                        <div className="grid grid-cols-5 gap-1.5">
                          {c.pool.slice(0, 10).map((entry) => (
                            <div key={entry.illustration_id}>
                              <img
                                src={artCropUrl(entry.set_code, entry.collector_number, entry.image_version)}
                                alt={entry.name}
                                className="w-full rounded aspect-[4/3] object-cover"
                              />
                              <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                                {entry.name}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
