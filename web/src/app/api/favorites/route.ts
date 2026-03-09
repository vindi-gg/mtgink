import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFavoritedIllustrations, getUserFavorites } from "@/lib/queries";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const illustrationIds = searchParams.get("illustration_ids");

    // Batch check mode: ?illustration_ids=a,b,c
    if (illustrationIds) {
      const ids = illustrationIds.split(",").filter(Boolean);
      const favorited = await getFavoritedIllustrations(user.id, ids);
      return NextResponse.json({ favorited: Array.from(favorited) });
    }

    // List mode: ?limit=50&offset=0
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

    const result = await getUserFavorites(user.id, limit, offset);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
