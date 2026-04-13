import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";
import type { Brew } from "@/lib/types";

export const metadata = {
  title: "Admin Brews",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminBrewsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.user_metadata?.is_admin) redirect("/");

  const admin = getAdminClient();
  const { data } = await admin
    .from("brews")
    .select("*")
    .eq("is_public", false)
    .order("created_at", { ascending: false })
    .limit(100);

  const brews = (data ?? []) as Brew[];

  // Find which brews are currently assigned to daily challenges.
  const today = new Date().toISOString().slice(0, 10);
  const brewIds = brews.map((b) => b.id);
  const { data: activeRows } = brewIds.length > 0
    ? await admin
        .from("daily_challenges")
        .select("brew_id, challenge_date, challenge_type")
        .in("brew_id", brewIds)
    : { data: [] };

  // Map brew_id → challenge info for badge rendering.
  const activeMap = new Map<string, { date: string; type: string }>();
  for (const row of activeRows ?? []) {
    if (row.brew_id) {
      activeMap.set(row.brew_id, { date: row.challenge_date, type: row.challenge_type });
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Admin Brews</h1>
            <p className="text-sm text-gray-500 mt-1">
              {brews.length} private brew{brews.length !== 1 ? "s" : ""} (daily challenge only)
            </p>
          </div>
          <Link
            href="/brew"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors"
          >
            Create Brew
          </Link>
        </div>

        {brews.length === 0 ? (
          <div className="text-center py-12 border border-gray-800 rounded-xl bg-gray-900/40">
            <p className="text-gray-400 mb-4">No private brews yet.</p>
            <p className="text-xs text-gray-600">
              Create a brew with &quot;Daily Challenge&quot; checked to make it private.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {brews.map((brew) => {
              const img = brew.preview_set_code && brew.preview_collector_number
                ? artCropUrl(brew.preview_set_code, brew.preview_collector_number, brew.preview_image_version)
                : null;
              const cardCount = brew.mode === "bracket" ? brew.bracket_size : brew.pool_size;
              return (
                <Link
                  key={brew.id}
                  href={`/brew/${brew.slug}`}
                  className="flex items-center gap-4 p-3 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-gray-700 transition-colors"
                >
                  {img ? (
                    <img
                      src={img}
                      alt={brew.name}
                      className="w-20 h-[58px] object-cover rounded-md border border-gray-800 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-[58px] rounded-md bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] text-gray-600">No preview</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{brew.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {brew.mode} · {brew.source_label}
                      {cardCount ? ` · ${cardCount} cards` : ""}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      Created {new Date(brew.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {activeMap.has(brew.id) && (() => {
                      const info = activeMap.get(brew.id)!;
                      const isToday = info.date === today;
                      return (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          isToday
                            ? "bg-green-500/15 text-green-400 border-green-500/30"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        }`}>
                          {isToday ? "Live today" : `${info.type} · ${info.date}`}
                        </span>
                      );
                    })()}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-800 text-gray-500 border border-gray-700">
                      Private
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
