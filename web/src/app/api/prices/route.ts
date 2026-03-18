import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const scryfallId = searchParams.get("scryfall_id");
  const oracleId = searchParams.get("oracle_id");
  const illustrationId = searchParams.get("illustration_id");

  if (!scryfallId && !oracleId && !illustrationId) {
    return NextResponse.json({ error: "Provide scryfall_id, oracle_id, or illustration_id" }, { status: 400 });
  }

  try {
    if (scryfallId) {
      const { data } = await getAdminClient()
        .from("best_prices")
        .select("*")
        .eq("scryfall_id", scryfallId);
      return NextResponse.json(data ?? []);
    }

    // Cheapest printing with this illustration (same art)
    if (illustrationId) {
      const { data: printings } = await getAdminClient()
        .from("printings")
        .select("scryfall_id")
        .eq("illustration_id", illustrationId);

      if (!printings || printings.length === 0) return NextResponse.json([]);

      const { data } = await getAdminClient()
        .from("best_prices")
        .select("*")
        .in("scryfall_id", printings.map((p) => p.scryfall_id))
        .order("market_price", { ascending: true })
        .limit(1);
      return NextResponse.json(data ?? []);
    }

    // For oracle_id: get cheapest price across all printings
    const { data: printings } = await getAdminClient()
      .from("printings")
      .select("scryfall_id")
      .eq("oracle_id", oracleId!);

    if (!printings || printings.length === 0) {
      return NextResponse.json([]);
    }

    const { data } = await getAdminClient()
      .from("best_prices")
      .select("*")
      .in("scryfall_id", printings.map((p) => p.scryfall_id))
      .order("market_price", { ascending: true })
      .limit(3);

    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
