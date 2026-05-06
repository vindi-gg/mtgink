import { NextRequest, NextResponse } from "next/server";
import { getIllustrationsForSet } from "@/lib/queries";
import type { SetArtSort } from "@/lib/types";

const SORTS: SetArtSort[] = ["popularity", "az", "price", "latest"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ set_code: string }> },
) {
  const { set_code } = await params;
  const sortParam = request.nextUrl.searchParams.get("sort");
  const sort: SetArtSort = SORTS.includes(sortParam as SetArtSort)
    ? (sortParam as SetArtSort)
    : "popularity";
  const limit = Math.min(120, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 60)));
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? 0));

  const page = await getIllustrationsForSet(set_code, sort, limit, offset);
  return NextResponse.json(page);
}
