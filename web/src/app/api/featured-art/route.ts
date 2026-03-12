import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";

export async function GET(request: NextRequest) {
  const count = Math.min(
    parseInt(request.nextUrl.searchParams.get("count") ?? "3", 10),
    10,
  );

  const admin = getAdminClient();

  // Get top-voted illustrations
  const { data: topArt } = await admin
    .from("art_ratings")
    .select("illustration_id")
    .order("vote_count", { ascending: false })
    .limit(30);

  if (!topArt || topArt.length === 0) {
    return NextResponse.json({ images: Array(count).fill(null) });
  }

  // Pick random subset
  const shuffled = topArt.sort(() => Math.random() - 0.5).slice(0, count);
  const ids = shuffled.map((a) => a.illustration_id);

  // Get representative printings for image URLs
  const { data: printings } = await admin
    .from("printings")
    .select("illustration_id, set_code, collector_number")
    .in("illustration_id", ids);

  const imageMap = new Map<string, string>();
  for (const p of printings ?? []) {
    if (!imageMap.has(p.illustration_id)) {
      imageMap.set(p.illustration_id, artCropUrl(p.set_code, p.collector_number));
    }
  }

  const images = ids.map((id) => imageMap.get(id) ?? null);

  return NextResponse.json(
    { images },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } },
  );
}
