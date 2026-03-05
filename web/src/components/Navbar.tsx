"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.refresh();
  }

  const links = [
    { href: "/compare", label: "Compare" },
    { href: "/browse", label: "Browse" },
    { href: "/db", label: "Database" },
    ...(user
      ? [
          { href: "/history", label: "History" },
          { href: "/favorites", label: "Favorites" },
        ]
      : []),
  ];

  // Get user initials or avatar
  const avatarUrl = user?.user_metadata?.avatar_url;
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email;
  const initials = displayName
    ? displayName
        .split(" ")
        .map((s: string) => s[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-amber-400">
          MTG Ink
        </Link>
        <div className="flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                pathname === link.href ||
                (link.href === "/db" && pathname.startsWith("/db/"))
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {user ? (
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-gray-900">
                  {initials}
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : supabase ? (
            <Link
              href="/auth"
              className={`text-sm font-medium transition-colors ${
                pathname === "/auth"
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Sign In
            </Link>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
