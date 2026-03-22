import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnTo = searchParams.get("returnTo") || "/";

  // Use the host the browser actually hit, not the server's localhost
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("host") ?? "localhost:3001";
  const baseUrl = `${proto}://${host}`;

  // Only allow relative redirects to prevent open redirect
  const redirectUrl = returnTo.startsWith("/") ? `${baseUrl}${returnTo}` : baseUrl;

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("Auth callback error:", error.message);
      } else {
        return NextResponse.redirect(redirectUrl);
      }
    } else {
      console.error("Auth callback: supabase client is null");
    }
  } else {
    console.error("Auth callback: no code parameter");
  }

  return NextResponse.redirect(redirectUrl);
}
