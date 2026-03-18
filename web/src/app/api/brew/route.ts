import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBrew, listPublicBrews } from "@/lib/brew-queries";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sort = params.get("sort") === "newest" ? "newest" : "popular";
  const limit = Math.min(parseInt(params.get("limit") ?? "20") || 20, 100);
  const offset = parseInt(params.get("offset") ?? "0") || 0;

  try {
    const result = await listPublicBrews(sort, limit, offset);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ brews: [], total: 0 }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, mode, source, source_id, source_label, colors, card_type, subtype, rules_text, pool_size, is_public, pool } = body;

    if (!name || !mode || !source || !source_label) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get user if authenticated
    let userId: string | null = null;
    const supabase = await createClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    const result = await createBrew({
      userId,
      name,
      description,
      mode,
      source,
      sourceId: source_id,
      sourceLabel: source_label,
      colors,
      cardType: card_type,
      subtype,
      rulesText: rules_text,
      poolSize: pool_size,
      isPublic: is_public,
      pool: pool ?? undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create brew";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
