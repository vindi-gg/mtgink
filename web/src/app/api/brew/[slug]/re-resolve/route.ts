import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBrewBySlug, resolveBrewPool } from "@/lib/brew-queries";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/brew/[slug]/re-resolve
 * Re-resolves the brew's pool from its stored source + filters.
 * Returns the new pool without saving — the client previews it first.
 * Pass ?save=true to persist immediately.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = !!user?.user_metadata?.is_admin;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brew = await getBrewBySlug(slug);
  if (!brew || (brew.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: "Brew not found" }, { status: 404 });
  }

  const poolSize = brew.mode === "bracket"
    ? (brew.bracket_size ?? brew.pool?.length ?? 16)
    : (brew.pool_size ?? brew.pool?.length ?? 10);

  try {
    const pool = await resolveBrewPool({
      mode: brew.mode,
      source: brew.source,
      sourceId: brew.source_id,
      colors: brew.colors ?? undefined,
      cardType: brew.card_type ?? undefined,
      subtype: brew.subtype ?? undefined,
      rulesText: brew.rules_text ?? undefined,
      poolSize,
      includeChildren: brew.include_children,
      onlyNewCards: brew.only_new_cards,
      firstIllustrationOnly: brew.first_illustration_only,
      lastIllustrationOnly: brew.last_illustration_only,
    });

    const save = request.nextUrl.searchParams.get("save") === "true";
    if (save) {
      const updateData: Record<string, unknown> = {
        pool,
        updated_at: new Date().toISOString(),
      };
      if (brew.mode === "bracket") updateData.bracket_size = pool.length;
      else updateData.pool_size = pool.length;

      await getAdminClient().from("brews").update(updateData).eq("id", brew.id);
    }

    return NextResponse.json({ pool, saved: save });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve pool";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
