import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Auth not configured" }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { searchParams } = request.nextUrl;

    // Batch check mode: ?oracle_ids=a,b,c
    const oracleIds = searchParams.get("oracle_ids");
    if (oracleIds) {
      const ids = oracleIds.split(",").filter(Boolean);
      const { data } = await supabase
        .from("card_favorites")
        .select("oracle_id")
        .eq("user_id", user.id)
        .in("oracle_id", ids);
      return NextResponse.json({ favorited: (data ?? []).map((d) => d.oracle_id) });
    }

    // List mode
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

    const { count } = await supabase
      .from("card_favorites")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const { data } = await supabase
      .from("card_favorites")
      .select("oracle_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!data || data.length === 0) {
      return NextResponse.json({ cards: [], total: count ?? 0 });
    }

    // Enrich with card data + representative printing
    const { getAdminClient } = await import("@/lib/supabase/admin");
    const admin = getAdminClient();
    const ids = data.map((d) => d.oracle_id);

    const [{ data: cardData }, { data: printingData }] = await Promise.all([
      admin.from("oracle_cards").select("oracle_id, name, slug, type_line").in("oracle_id", ids),
      admin
        .from("printings")
        .select("oracle_id, set_code, collector_number, image_version, artist, sets!inner(name, digital)")
        .in("oracle_id", ids)
        .not("illustration_id", "is", null)
        .eq("sets.digital", false)
        .order("released_at", { ascending: false }),
    ]);

    const cardMap = new Map((cardData ?? []).map((c) => [c.oracle_id, c]));
    const printingMap = new Map<string, typeof printingData extends (infer T)[] | null ? T : never>();
    for (const p of printingData ?? []) {
      if (!printingMap.has(p.oracle_id)) printingMap.set(p.oracle_id, p);
    }

    const cards = data.map((d) => {
      const card = cardMap.get(d.oracle_id);
      const printing = printingMap.get(d.oracle_id);
      return {
        oracle_id: d.oracle_id,
        name: card?.name ?? "Unknown",
        slug: card?.slug ?? "",
        type_line: card?.type_line ?? null,
        set_code: printing?.set_code ?? "",
        collector_number: printing?.collector_number ?? "",
        image_version: printing?.image_version ?? null,
        artist: printing?.artist ?? "",
        created_at: d.created_at,
      };
    });

    return NextResponse.json({ cards, total: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Auth not configured" }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { oracle_id } = await request.json();
    if (!oracle_id) return NextResponse.json({ error: "oracle_id required" }, { status: 400 });

    const { error } = await supabase
      .from("card_favorites")
      .insert({ user_id: user.id, oracle_id });

    if (error && error.code !== "23505") { // ignore duplicate
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ favorited: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Auth not configured" }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { oracle_id } = await request.json();
    if (!oracle_id) return NextResponse.json({ error: "oracle_id required" }, { status: 400 });

    await supabase
      .from("card_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("oracle_id", oracle_id);

    return NextResponse.json({ favorited: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
