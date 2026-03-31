import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const paths: string[] = body.paths || [];

  if (paths.length === 0) {
    return NextResponse.json({ error: "No paths provided" }, { status: 400 });
  }

  const results: Record<string, string> = {};
  for (const path of paths) {
    try {
      revalidatePath(path);
      results[path] = "ok";
    } catch (err) {
      results[path] = `error: ${(err as Error).message}`;
    }
  }

  return NextResponse.json({ revalidated: true, results });
}
