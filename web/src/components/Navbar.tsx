"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import SearchModal from "./SearchModal";

function isActiveLink(pathname: string, href: string): boolean {
  if (href === "/ink" && pathname.startsWith("/ink")) return true;
  if (href === "/clash" && pathname.startsWith("/clash")) return true;
  if (href === "/db" && (pathname === "/db" || pathname.startsWith("/db/"))) return true;
  if (href === "/deck" && (pathname === "/deck" || pathname.startsWith("/deck/"))) return true;
  if (href === "/browse" && pathname.startsWith("/browse")) return true;
  if (href === "/artists" && pathname.startsWith("/artists")) return true;
  if (href === "/brew" && pathname.startsWith("/brew")) return true;
  if (href === "/favorites" && pathname.startsWith("/favorites")) return true;
  if (href === "/history" && pathname.startsWith("/history")) return true;
  return false;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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

  // Close menus on navigation
  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // Cmd+K / Ctrl+K / "/" to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      // "/" to open search (like GitHub), unless typing in an input/textarea/contenteditable
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.refresh();
  }

  // Primary links — always visible on desktop and mobile
  const primaryLinks = [
    { href: "/ink", label: "Ink" },
    { href: "/clash", label: "Clash" },
  ];

  // Secondary links — visible on desktop, in hamburger on mobile
  const secondaryLinks = [
    { href: "/artists", label: "Artists" },
    { href: "/brew", label: "Brew" },
    { href: "/db", label: "DB" },
  ];

  // User menu links — shown in avatar dropdown and mobile menu when logged in
  const userMenuLinks = [
    { href: "/favorites", label: "Favorites" },
    { href: "/history", label: "Vote History" },
    { href: "/deck", label: "Library" },
  ];

  const allLinks = [...primaryLinks, ...secondaryLinks];

  // Avatar
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
        {/* Logo */}
        <Link href="/" className="flex flex-col font-bold" style={{ lineHeight: 1.1 }}>
          <span className="text-sm tracking-widest text-white">MTG</span>
          <span className="text-sm text-amber-400" style={{ letterSpacing: "0.32em" }}>INK</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {allLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                isActiveLink(pathname, link.href)
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 border border-gray-700 rounded-md text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
            title="Search (Cmd+K)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <kbd className="text-[10px] text-gray-600">/</kbd>
          </button>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1.5 cursor-pointer"
              >
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
                <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                    <div className="px-3 py-2 border-b border-gray-800">
                      <p className="text-sm font-medium text-white truncate">{displayName}</p>
                    </div>
                    {userMenuLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`block px-3 py-2 text-sm transition-colors ${
                          isActiveLink(pathname, link.href)
                            ? "text-white bg-gray-800"
                            : "text-gray-400 hover:text-white hover:bg-gray-800"
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                    <div className="border-t border-gray-800 mt-1 pt-1">
                      <button
                        onClick={handleSignOut}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : supabase ? (
            <Link
              href="/auth"
              className={`text-sm font-medium transition-colors ${
                isActiveLink(pathname, "/auth")
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Sign In
            </Link>
          ) : null}
        </div>

        {/* Mobile nav */}
        <div className="flex md:hidden items-center gap-4">
          {/* Primary links always visible */}
          {primaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-bold transition-colors ${
                isActiveLink(pathname, link.href)
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Search (mobile) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Avatar / Sign in (mobile) */}
          {user ? (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex-shrink-0"
            >
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
            </button>
          ) : supabase ? (
            <Link
              href="/auth"
              className="h-7 w-7 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0"
            >
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </Link>
          ) : (
            /* Hamburger for non-auth setup */
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex-shrink-0 text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-950/95 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-3 space-y-1">
            {secondaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActiveLink(pathname, link.href)
                    ? "text-white bg-gray-800"
                    : "text-gray-400 hover:text-white hover:bg-gray-900"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <>
                <div className="border-t border-gray-800 my-2" />
                {userMenuLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActiveLink(pathname, link.href)
                        ? "text-white bg-gray-800"
                        : "text-gray-400 hover:text-white hover:bg-gray-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-900 transition-colors"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </nav>
  );
}
