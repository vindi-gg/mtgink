import { NextRequest, NextResponse } from "next/server";
import { getTopIllustrations } from "@/lib/queries";
import type { SetArtSort } from "@/lib/types";

const SORTS: SetArtSort[] = ["popularity", "az", "price", "latest"];

function pickVersion(req: NextRequest): "v1" | "v2" {
  const q = req.nextUrl.searchParams.get("version");
  if (q === "v1" || q === "v2") return q;
  const env = process.env.POPULAR_SORT_VERSION;
  return env === "v2" ? "v2" : "v1";
}

function pickExponent(req: NextRequest): number | undefined {
  const raw = req.nextUrl.searchParams.get("exp");
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return undefined;
  return n;
}

export async function GET(request: NextRequest) {
  const sortParam = request.nextUrl.searchParams.get("sort");
  const sort: SetArtSort = SORTS.includes(sortParam as SetArtSort)
    ? (sortParam as SetArtSort)
    : "popularity";
  const limit = Math.min(120, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 30)));
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? 0));
  const version = pickVersion(request);
  const exp = pickExponent(request);

  const page = await getTopIllustrations(sort, limit, offset, version, exp);
  return NextResponse.json(page);
}
