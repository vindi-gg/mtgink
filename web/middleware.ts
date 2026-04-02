import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old routes → new /showdown routes
  if (pathname === "/ink" || pathname === "/compare") {
    const url = request.nextUrl.clone();
    // /ink?mode=vs → /showdown/vs (preserve other params)
    if (url.searchParams.get("mode") === "vs") {
      url.searchParams.delete("mode");
      url.pathname = "/showdown/vs";
    } else {
      url.pathname = "/showdown/remix";
    }
    return NextResponse.redirect(url, 301);
  }
  if (pathname === "/clash") {
    const url = request.nextUrl.clone();
    url.pathname = "/showdown/vs";
    return NextResponse.redirect(url, 301);
  }
  if (pathname === "/ink/gauntlet" || pathname === "/clash/gauntlet" || pathname === "/bracket" || pathname === "/clash/bracket") {
    const url = request.nextUrl.clone();
    url.pathname = "/showdown/gauntlet";
    return NextResponse.redirect(url, 301);
  }

  // Skip session refresh on public content pages so Vercel can ISR cache them
  // Only refresh session on pages that need auth state
  const needsAuth =
    pathname.startsWith("/settings") ||
    pathname.startsWith("/favorites") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/deck") ||
    pathname.startsWith("/inkadmin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/");

  if (needsAuth) {
    return await updateSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
