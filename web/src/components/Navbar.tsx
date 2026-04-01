"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import SearchModal from "./SearchModal";
import { PLAY_MODES, DB_MODES, PlayModeIcon } from "@/lib/play-modes";

function isActiveLink(pathname: string, href: string): boolean {
  if (href === "/showdown/remix" && (pathname.startsWith("/showdown/remix") || pathname === "/showdown")) return true;
  if (href === "/showdown/vs" && pathname.startsWith("/showdown/vs")) return true;
  if (href === "/db" && (pathname === "/db" || pathname.startsWith("/db/"))) return true;
  if (href === "/deck" && (pathname === "/deck" || pathname.startsWith("/deck/"))) return true;
  if (href === "/deck-import" && pathname.startsWith("/deck")) return true;
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
  const [playMenuOpen, setPlayMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [betaDismissed, setBetaDismissed] = useState(true);
  const [dbMenuOpen, setDbMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const playMenuRef = useRef<HTMLDivElement>(null);
  const dbMenuRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    setBetaDismissed(localStorage.getItem("mtgink_beta_dismissed") === "1");
  }, []);

  useEffect(() => {
    if (!userMenuOpen && !playMenuOpen && !dbMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (playMenuOpen && playMenuRef.current && !playMenuRef.current.contains(e.target as Node)) {
        setPlayMenuOpen(false);
      }
      if (dbMenuOpen && dbMenuRef.current && !dbMenuRef.current.contains(e.target as Node)) {
        setDbMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen, playMenuOpen, dbMenuOpen]);

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
    setPlayMenuOpen(false);
    setDbMenuOpen(false);
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
  const primaryLinks: { href: string; label: string }[] = [];

  // Secondary links — visible on desktop, in hamburger on mobile
  const secondaryLinks = [
    { href: "/deck-import", label: "Decks" },
  ];

  // User menu links — shown in avatar dropdown and mobile menu when logged in
  const userMenuLinks = [
    { href: "/favorites", label: "Favorites" },
    { href: "/history", label: "Vote History" },
    { href: "/deck", label: "My Decks" },
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

  const isShowdown = pathname.startsWith("/showdown") || pathname.startsWith("/daily/gauntlet") || pathname.endsWith("/remix");

  return (
    <>
    <nav className={`relative border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm z-[60] ${isShowdown ? "md:sticky md:top-0" : "sticky top-0"}`}>
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex flex-col items-center font-bold pt-[5px]" style={{ lineHeight: 0.9, fontFamily: "'Futura', 'Futura Bold', 'Trebuchet MS', Arial, sans-serif" }}>
          <span className="text-[11px] tracking-[0.25em] text-white">MTG</span>
          <span className="text-xl text-amber-400 tracking-wide">INK</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {/* Play mega menu */}
          <div
            className="relative"
            ref={playMenuRef}
            onMouseEnter={() => setPlayMenuOpen(true)}
            onMouseLeave={() => setPlayMenuOpen(false)}
          >
            <button
              className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer ${
                PLAY_MODES.some((l) => isActiveLink(pathname, l.href))
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Play
              <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {playMenuOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-[71]">
                <div className="w-[420px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3 grid grid-cols-2 gap-2">
                  {PLAY_MODES.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-start gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActiveLink(pathname, item.href)
                          ? "bg-amber-500/10 border border-amber-500/30"
                          : "hover:bg-gray-800"
                      }`}
                    >
                      <PlayModeIcon d={item.icon} className="w-5 h-5 mt-0.5 text-amber-400 shrink-0" />
                      <div>
                        <span className={`text-sm font-bold ${isActiveLink(pathname, item.href) ? "text-amber-400" : "text-white"}`}>{item.label}</span>
                        <p className="text-xs text-gray-500 mt-0.5 leading-tight">{item.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

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

          {/* Database mega menu */}
          <div
            className="relative"
            ref={dbMenuRef}
            onMouseEnter={() => setDbMenuOpen(true)}
            onMouseLeave={() => setDbMenuOpen(false)}
          >
            <button
              className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer ${
                DB_MODES.some((l) => isActiveLink(pathname, l.href))
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Database
              <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dbMenuOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-[71]">
                <div className="w-[420px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3 grid grid-cols-2 gap-2">
                  {DB_MODES.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-start gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActiveLink(pathname, item.href)
                          ? "bg-amber-500/10 border border-amber-500/30"
                          : "hover:bg-gray-800"
                      }`}
                    >
                      <PlayModeIcon d={item.icon} className="w-5 h-5 mt-0.5 text-amber-400 shrink-0" />
                      <div>
                        <span className={`text-sm font-bold ${isActiveLink(pathname, item.href) ? "text-amber-400" : "text-white"}`}>{item.label}</span>
                        <p className="text-xs text-gray-500 mt-0.5 leading-tight">{item.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

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
            <div className="relative" ref={userMenuRef}>
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
                  <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[71] py-1">
                    <Link href="/settings" className="block px-3 py-2 border-b border-gray-800 hover:bg-gray-800 transition-colors cursor-pointer">
                      <p className="text-sm font-medium text-white truncate">{displayName}</p>
                      <p className="text-[11px] text-gray-500">Settings</p>
                    </Link>
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
          {/* Play button */}
          <button
            data-play-btn
            onClick={() => { setPlayMenuOpen(!playMenuOpen); setMenuOpen(false); setDbMenuOpen(false); }}
            className={`px-3 py-1 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
              playMenuOpen || pathname.startsWith("/showdown") || pathname.startsWith("/daily")
                ? "bg-amber-500 text-gray-900"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Play
          </button>

          {/* DB button */}
          <button
            onClick={() => { setDbMenuOpen(!dbMenuOpen); setPlayMenuOpen(false); setMenuOpen(false); }}
            className={`text-sm font-bold transition-colors cursor-pointer ${
              dbMenuOpen || pathname.startsWith("/db") || pathname.startsWith("/artists")
                ? "text-white"
                : "text-gray-400"
            }`}
          >
            DB
          </button>

          {/* Deck import icon */}
          <Link
            href="/deck-import"
            className={`transition-colors ${
              pathname.startsWith("/deck") ? "text-white" : "text-gray-400"
            }`}
            title="Import Deck"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </Link>

          {/* Search (mobile) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-900/50 text-gray-400 hover:border-gray-500 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <kbd className="text-[10px] text-gray-600">/</kbd>
          </button>

          {/* Avatar / Sign in (mobile) */}
          {user ? (
            <button
              onClick={() => { setMenuOpen(!menuOpen); setPlayMenuOpen(false); }}
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
            <button
              onClick={() => { setMenuOpen(!menuOpen); setPlayMenuOpen(false); }}
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
      {menuOpen && user && (
        <div className="md:hidden border-t border-gray-800 bg-gray-950/95 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 space-y-1">
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
            <Link
              href="/settings"
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActiveLink(pathname, "/settings")
                  ? "text-white bg-gray-800"
                  : "text-gray-400 hover:text-white hover:bg-gray-900"
              }`}
            >
              Settings
            </Link>
            <div className="border-t border-gray-800 my-2" />
            <button
              onClick={handleSignOut}
              className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-900 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </nav>
    {/* Beta banner */}
    {!betaDismissed && (
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs text-amber-400/80">
        MTG Ink is in beta — we&apos;ll do our best not to reset favorites and decks, but we may have to!
        <button
          onClick={() => { setBetaDismissed(true); localStorage.setItem("mtgink_beta_dismissed", "1"); }}
          className="ml-2 text-amber-500/50 hover:text-amber-400 cursor-pointer"
        >
          &times;
        </button>
      </div>
    )}
    {/* Mobile DB panel */}
    {dbMenuOpen && (
        <div ref={dbMenuRef} className="md:hidden border-t border-gray-800 bg-gray-950 z-[61] fixed left-0 right-0 top-14">
          <div className="px-4 py-4 space-y-2">
            {DB_MODES.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDbMenuOpen(false)}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActiveLink(pathname, item.href)
                    ? "bg-amber-500/10 border border-amber-500/30"
                    : "bg-gray-900 border border-gray-800 hover:border-gray-700"
                }`}
              >
                <PlayModeIcon d={item.icon} className="w-5 h-5 mt-0.5 text-amber-400 shrink-0" />
                <div>
                  <span className={`text-sm font-bold ${
                    isActiveLink(pathname, item.href) ? "text-amber-400" : "text-white"
                  }`}>{item.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
    )}
    {/* Mobile Play panel — outside nav so backdrop-blur doesn't trap fixed overlay */}
    {playMenuOpen && (
      <>
        <div className="fixed inset-0 z-[59] md:hidden bg-black/50" onClick={() => setPlayMenuOpen(false)} />
        <div data-play-panel className="md:hidden border-t border-gray-800 bg-gray-950 z-[61] fixed left-0 right-0 top-14">
          <div className="px-4 py-4 space-y-2">
            {PLAY_MODES.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActiveLink(pathname, item.href)
                    ? "bg-amber-500/10 border border-amber-500/30"
                    : "bg-gray-900 border border-gray-800 hover:border-gray-700"
                }`}
              >
                <PlayModeIcon d={item.icon} className="w-5 h-5 mt-0.5 text-amber-400 shrink-0" />
                <div>
                  <span className={`text-sm font-bold ${
                    isActiveLink(pathname, item.href) ? "text-amber-400" : "text-white"
                  }`}>{item.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </>
    )}
    </>
  );
}
