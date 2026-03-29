"use client";

import { useState, useEffect } from "react";
import { useImageMode } from "@/lib/image-mode";

interface CardLink {
  name: string;
  slug: string;
}

export type ThemeRotation = "every" | "5" | "manual";
export type VsThemeType = "tribe" | "set" | "artist" | "tag" | "art_tag";
export const VS_THEME_TYPES: { value: VsThemeType; label: string }[] = [
  { value: "tribe", label: "Tribe" },
  { value: "set", label: "Set" },
  { value: "artist", label: "Artist" },
  { value: "tag", label: "Card Tag" },
  { value: "art_tag", label: "Art Tag" },
];

interface ShowdownSubnavProps {
  children: React.ReactNode;
  shareUrl?: string;
  cardLinks?: CardLink[];
  themeRotation?: ThemeRotation;
  onThemeRotationChange?: (value: ThemeRotation) => void;
  onNewTheme?: () => void;
  themeTypes?: VsThemeType[];
  onThemeTypesChange?: (types: VsThemeType[]) => void;
}

const rotationOptions: { value: ThemeRotation; label: string }[] = [
  { value: "every", label: "Every vote" },
  { value: "5", label: "5 votes" },
  { value: "manual", label: "Manual" },
];

// --- Shared options panel (used in mobile popover + desktop sidebar) ---

function OptionsPanel({
  shareUrl,
  cardLinks,
  themeRotation,
  onThemeRotationChange,
  onNewTheme,
  themeTypes,
  onThemeTypesChange,
}: Omit<ShowdownSubnavProps, "children">) {
  const { imageMode, toggleImageMode } = useImageMode();
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {/* Art/Card pill toggle */}
      <div>
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          <button
            onClick={() => { if (imageMode !== "art") toggleImageMode(); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
              imageMode === "art"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Art
          </button>
          <button
            onClick={() => { if (imageMode !== "card") toggleImageMode(); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
              imageMode === "card"
                ? "bg-amber-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Card
          </button>
        </div>
      </div>

      {/* Theme rotation (VS only) */}
      {themeRotation && onThemeRotationChange && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">New theme</p>
          <div className="flex rounded-lg border border-gray-700 overflow-hidden">
            {rotationOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onThemeRotationChange(opt.value)}
                className={`flex-1 px-2 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  themeRotation === opt.value
                    ? "bg-amber-500 text-gray-900"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {themeRotation === "manual" && onNewTheme && (
            <button
              onClick={onNewTheme}
              className="w-full mt-2 px-4 py-2 text-sm font-medium text-gray-300 border border-gray-700 rounded-lg hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
            >
              New theme
            </button>
          )}
        </div>
      )}

      {/* Theme type toggles (VS only) */}
      {themeTypes && onThemeTypesChange && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Theme types</p>
          <div className="space-y-1">
            {VS_THEME_TYPES.map((t) => {
              const enabled = themeTypes.includes(t.value);
              return (
                <button
                  key={t.value}
                  onClick={() => {
                    if (enabled && themeTypes.length <= 1) return;
                    onThemeTypesChange(
                      enabled
                        ? themeTypes.filter((v) => v !== t.value)
                        : [...themeTypes, t.value]
                    );
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
                    enabled
                      ? "text-white bg-gray-800"
                      : "text-gray-500 hover:text-gray-400"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                    enabled ? "bg-amber-500 border-amber-500" : "border-gray-600"
                  }`}>
                    {enabled && (
                      <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Card links */}
      {cardLinks && cardLinks.length > 0 && (
        <div className="space-y-1">
          {cardLinks.map((link) => (
            <a
              key={link.slug}
              href={`/card/${link.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 hover:bg-gray-800 hover:text-amber-400 transition-colors rounded-lg"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View {link.name}
            </a>
          ))}
        </div>
      )}

      {/* Share */}
      {shareUrl && (
        <button
          onClick={handleShare}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors rounded-lg cursor-pointer"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Share matchup</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

// --- Desktop sidebar ---

export function ShowdownSidebar(props: Omit<ShowdownSubnavProps, "children">) {
  return (
    <aside className="hidden md:block w-[300px] flex-shrink-0">
      <div className="sticky top-20 space-y-4">
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <OptionsPanel {...props} />
        </div>
      </div>
    </aside>
  );
}

// --- Main subnav (heading + hamburger on mobile) ---

export default function ShowdownSubnav({
  children,
  shareUrl,
  cardLinks,
  themeRotation,
  onThemeRotationChange,
  onNewTheme,
  themeTypes,
  onThemeTypesChange,
}: ShowdownSubnavProps) {
  const [open, setOpen] = useState(false);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative mb-1 md:mb-2 px-2">
      <div className="flex items-center gap-2">
        {/* Heading (fills space) */}
        <h2 className="flex-1 font-bold text-center text-base md:text-lg truncate min-w-0">
          {children}
        </h2>

        {/* Hamburger (mobile only) */}
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="flex-shrink-0 p-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer md:hidden"
          title="Options"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile popover */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 left-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <OptionsPanel
              shareUrl={shareUrl}
              cardLinks={cardLinks}
              themeRotation={themeRotation}
              onThemeRotationChange={onThemeRotationChange}
              onNewTheme={onNewTheme}
              themeTypes={themeTypes}
              onThemeTypesChange={onThemeTypesChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
