import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old routes
  if (pathname === "/compare" || pathname.startsWith("/compare?")) {
    const url = request.nextUrl.clone();
    url.pathname = "/ink";
    // Preserve oracle_id and filter params
    return NextResponse.redirect(url, 301);
  }
  if (pathname === "/bracket") {
    const url = request.nextUrl.clone();
    url.pathname = "/ink/gauntlet";
    return NextResponse.redirect(url, 301);
  }
  if (pathname === "/clash/bracket") {
    const url = request.nextUrl.clone();
    url.pathname = "/ink/gauntlet";
    return NextResponse.redirect(url, 301);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
