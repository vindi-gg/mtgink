import { NextRequest, NextResponse } from "next/server";
import { getTopIllustrations } from "@/lib/queries";
import type { SetArtSort } from "@/lib/types";

const SORTS: SetArtSort[] = ["popularity", "az", "price", "latest"];

export async function GET(request: NextRequest) {
  const sortParam = request.nextUrl.searchParams.get("sort");
  const sort: SetArtSort = SORTS.includes(sortParam as SetArtSort)
    ? (sortParam as SetArtSort)
    : "popularity";
  const limit = Math.min(120, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 30)));
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? 0));

  const page = await getTopIllustrations(sort, limit, offset);
  return NextResponse.json(page);
}
