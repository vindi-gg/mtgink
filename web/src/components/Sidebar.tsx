"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useImageMode } from "@/lib/image-mode";
import { useBracketSource } from "@/lib/bracket-source-context";
import { PlayModeIcon, BRACKET_ICON } from "@/lib/play-modes";
import CreateBracketPanel from "./CreateBracketPanel";
import MobileBracketFab from "./MobileBracketFab";
import BracketPanel from "./BracketPanel";

function ArtCardToggle() {
  const { imageMode, toggleImageMode } = useImageMode();
  return (
    <>
      <div className="flex rounded-lg border border-gray-700 overflow-hidden">
        <button
          onClick={() => { if (imageMode !== "art") toggleImageMode(); }}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            imageMode === "art"
              ? "bg-amber-500 text-gray-900"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          Art
        </button>
        <button
          onClick={() => { if (imageMode !== "card") toggleImageMode(); }}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            imageMode === "card"
              ? "bg-amber-500 text-gray-900"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          Card
        </button>
      </div>
      <p className="text-[10px] text-gray-600 text-center mt-1 mb-3 hidden md:block">Press <kbd className="text-gray-500">W</kbd> to toggle</p>
    </>
  );
}

function PlayButtons({ links }: { links: { label: string; href: string; style: "primary" | "danger" | "outline" }[] }) {
  const styles = {
    primary: "bg-amber-500 text-gray-900 hover:bg-amber-400",
    danger: "bg-red-600 text-white hover:bg-red-500",
    outline: "border border-amber-500 text-amber-400 hover:bg-amber-500/10",
  };
  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Play</h3>
      <div className="space-y-2">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            rel="nofollow"
            className={`flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${styles[link.style]}`}
          >
            {link.label.startsWith("Gauntlet") && (
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
            {link.label}
          </Link>
        ))}
      </div>
    </>
  );
}

type PlayLink = { label: string; href: string; style: "primary" | "danger" | "outline" };

function makePlayLinks(query: string, includeRemix = true): PlayLink[] {
  const links: PlayLink[] = [];
  if (includeRemix) links.push({ label: "Remix", href: `/showdown/remix?${query}`, style: "primary" });
  links.push({ label: "Gauntlet (20)", href: `/showdown/gauntlet?${query}&count=20`, style: "outline" });
  links.push({ label: "Gauntlet (All)", href: `/showdown/gauntlet?${query}&count=50`, style: "outline" });
  return links;
}

function getDetailContext(pathname: string): PlayLink[] | null {
  let m;

  // /db/expansions/[set_code]
  m = pathname.match(/^\/db\/expansions\/([^/]+)$/);
  if (m) return makePlayLinks(`set_code=${m[1]}`, false);

  // /artists/[slug]
  m = pathname.match(/^\/artists\/([^/]+)$/);
  if (m) return makePlayLinks(`artist=${encodeURIComponent(m[1])}`, false);

  // /db/tribes/[type]
  m = pathname.match(/^\/db\/tribes\/([^/]+)$/);
  if (m) return makePlayLinks(`subtype=${encodeURIComponent(m[1])}`, false);

  // /db/tags/[slug]
  m = pathname.match(/^\/db\/tags\/([^/]+)$/);
  if (m) return makePlayLinks(`tag=${encodeURIComponent(m[1])}`, false);

  // /db/art-tags/[slug]
  m = pathname.match(/^\/db\/art-tags\/([^/]+)$/);
  if (m) return makePlayLinks(`art_tag=${encodeURIComponent(m[1])}`, false);

  // /card/[slug] — handled via children prop (needs oracle_id from page)
  if (pathname.match(/^\/card\/[^/]+$/)) return [];

  return null;
}

function GenericBracketFab({ sourceType, sourceParam, totalCount, label }: {
  sourceType: "tribe" | "artist" | "card";
  sourceParam: string;
  totalCount: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-amber-500 text-gray-900 font-bold text-sm shadow-lg shadow-black/40 hover:bg-amber-400 transition-colors cursor-pointer"
        aria-label="Create bracket"
      >
        <span>Play</span>
        <PlayModeIcon d={BRACKET_ICON} className="w-5 h-5" />
      </button>
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/70 flex items-end justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-gray-900 border-t border-gray-800 rounded-t-2xl p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>
            <BracketPanel
              compact
              sourceType={sourceType}
              sourceParam={sourceParam}
              totalCount={totalCount}
              label={label}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full py-2 text-xs font-medium text-gray-400 hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const MIN_BRACKET_COUNT = 5;

export default function Sidebar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const playLinks = getDetailContext(pathname);
  const isExpansionPage = /^\/db\/expansions\/[^/]+$/.test(pathname);
  const bracketSource = useBracketSource();
  const showGenericBracket = bracketSource.sourceType !== null && bracketSource.totalCount >= MIN_BRACKET_COUNT;

  return (
    <>
      {isExpansionPage && <MobileBracketFab />}
      {!isExpansionPage && showGenericBracket && (
        <GenericBracketFab
          sourceType={bracketSource.sourceType!}
          sourceParam={bracketSource.sourceParam}
          totalCount={bracketSource.totalCount}
          label={bracketSource.label}
        />
      )}
      <aside className="hidden lg:block w-[300px] shrink-0 pt-[7rem]">
      <div className="space-y-6">
        {children}
        {isExpansionPage && <CreateBracketPanel />}
        {showGenericBracket && (
          <BracketPanel
            sourceType={bracketSource.sourceType!}
            sourceParam={bracketSource.sourceParam}
            totalCount={bracketSource.totalCount}
            label={bracketSource.label}
          />
        )}
        {playLinks && playLinks.length > 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <ArtCardToggle />
            <PlayButtons links={playLinks} />
          </div>
        ) : playLinks !== null ? (
          null
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Explore</h3>
            <nav className="space-y-2 text-sm">
              <a href="/db/expansions" className="block text-gray-300 hover:text-white transition-colors">Expansions</a>
              <a href="/db/cards" className="block text-gray-300 hover:text-white transition-colors">Cards</a>
              <a href="/artists" className="block text-gray-300 hover:text-white transition-colors">Artists</a>
              <a href="/db/tribes" className="block text-gray-300 hover:text-white transition-colors">Tribes</a>
              <a href="/db/tags" className="block text-gray-300 hover:text-white transition-colors">Card Tags</a>
              <a href="/db/art-tags" className="block text-gray-300 hover:text-white transition-colors">Art Tags</a>
            </nav>
          </div>
        )}
      </div>
      </aside>
    </>
  );
}
