import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const IMAGES_DIR = path.join(process.cwd(), "..", "data", "images");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;

  // Path traversal protection
  for (const seg of segments) {
    if (seg.includes("..") || seg.includes("/") || seg.includes("\\")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const filePath = path.join(IMAGES_DIR, ...segments);
  const resolved = path.resolve(filePath);

  // Ensure resolved path is within IMAGES_DIR
  if (!resolved.startsWith(path.resolve(IMAGES_DIR))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(resolved);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
