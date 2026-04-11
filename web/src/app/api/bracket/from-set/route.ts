import { NextRequest, NextResponse } from "next/server";
import { getBracketCardsForSet } from "@/lib/bracket";
import { seededShuffle } from "@/lib/seeded-random";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const setCode = sp.get("set_code");
  if (!setCode) {
    return NextResponse.json({ error: "set_code required" }, { status: 400 });
  }

  const raritiesParam = sp.get("rarities") ?? "";
  const rarities = raritiesParam.split(",").map((s) => s.trim()).filter(Boolean);
  const printingRaw = sp.get("printing") ?? "all";
  const printing = printingRaw === "new" || printingRaw === "reprints" ? printingRaw : "all";
  const sizeRaw = sp.get("size") ?? "all";
  const seed = sp.get("seed") ?? "default";

  const pool = await getBracketCardsForSet(setCode, {
    rarities: rarities.length > 0 ? rarities : undefined,
    printing,
  });

  if (pool.length < 2) {
    return NextResponse.json({ cards: [], error: "Not enough cards for a bracket" }, { status: 200 });
  }

  const shuffled = seededShuffle(pool, seed);

  let cards = shuffled;
  if (sizeRaw !== "all") {
    const size = parseInt(sizeRaw, 10);
    if (Number.isFinite(size) && size >= 2 && size <= 1024) {
      cards = shuffled.slice(0, Math.min(size, shuffled.length));
    }
  } else {
    cards = shuffled.slice(0, Math.min(1024, shuffled.length));
  }

  return NextResponse.json({ cards });
}
