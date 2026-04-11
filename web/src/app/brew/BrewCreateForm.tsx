"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { OracleCard, MtgSet, Tribe, Tag, Artist } from "@/lib/types";

type Mode = "remix" | "vs" | "gauntlet" | "bracket";
type Source = "card" | "expansion" | "tribe" | "tag" | "art_tag" | "artist" | "all";

const MODE_LABELS: Record<Mode, string> = { remix: "Remix", vs: "VS", gauntlet: "Gauntlet", bracket: "Bracket" };

/** Sentinel used for the "All" bracket size option. At submit time we resolve
 *  it to the live count of matching cards. */
const BRACKET_ALL = -1 as const;
const BRACKET_SIZES = [8, 16, 32, 64, 128, 256] as const;

const SOURCE_LABELS: Record<Source, string> = {
  all: "All Cards",
  card: "Card",
  expansion: "Expansion",
  tribe: "Tribe",
  tag: "Card Tag",
  art_tag: "Art Tag",
  artist: "Artist",
};

/** Which sources are available per mode */
const MODE_SOURCES: Record<Mode, Source[]> = {
  remix: ["card"],
  vs: ["all", "expansion", "tribe"],
  gauntlet: ["all", "card", "expansion", "tribe", "tag", "art_tag", "artist"],
  bracket: ["all", "card", "expansion", "tribe", "tag", "art_tag", "artist"],
};

const COLORS = ["W", "U", "B", "R", "G"] as const;
const COLOR_LABELS: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const COLOR_SYMBOLS: Record<string, string> = { W: "W", U: "U", B: "B", R: "R", G: "G" };

const CARD_TYPES = ["Creature", "Instant", "Sorcery", "Enchantment", "Artifact", "Planeswalker", "Land"];
const RARITIES = [
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "mythic", label: "Mythic" },
];

const COMMON_SUBTYPES = [
  "Elf", "Goblin", "Human", "Wizard", "Soldier", "Zombie", "Dragon", "Angel",
  "Merfolk", "Vampire", "Knight", "Elemental", "Beast", "Warrior", "Cleric",
  "Rogue", "Shaman", "Spirit", "Demon", "Bird", "Cat", "Dog", "Dinosaur",
  "Faerie", "Giant", "Phyrexian", "Sliver", "Treefolk",
];

interface SelectedItem {
  id: string;
  label: string;
}

export default function BrewCreateForm() {
  const router = useRouter();

  // Core state
  const [mode, setMode] = useState<Mode>("bracket");
  const [source, setSource] = useState<Source>("all");
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [bracketSize, setBracketSize] = useState<number>(16);
  const [includeChildren, setIncludeChildren] = useState<boolean>(false);
  const [onlyNewCards, setOnlyNewCards] = useState<boolean>(false);
  const [firstIllustrationOnly, setFirstIllustrationOnly] = useState<boolean>(false);

  // Filters
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState("");
  const [selectedSubtype, setSelectedSubtype] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [selectedRarity, setSelectedRarity] = useState("");
  const [showSubtypeDropdown, setShowSubtypeDropdown] = useState(false);
  const subtypeRef = useRef<HTMLDivElement>(null);

  // Gauntlet pool size
  const [poolSize, setPoolSize] = useState(10);

  // Live count
  const [count, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Search state
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SelectedItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Cached lists
  const [sets, setSets] = useState<MtgSet[] | null>(null);
  const [tribes, setTribes] = useState<Tribe[] | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether source requires an entity selection
  const needsSelection = source !== "all";

  // Formerly invalidated the preview pool cache; preview was removed
  // (server always resolves fresh on create) but the filter change
  // handlers still call this, so leave a no-op in place.
  const clearPreview = () => {};

  const handleSourceChange = (s: Source) => {
    setSource(s);
    setSelected(null);
    setQuery("");
    setSearchResults([]);
    clearPreview();
  };

  // Fetch cached lists
  useEffect(() => {
    if (source === "expansion" && !sets) {
      // ?all=true includes subsets (commander, tokens, mystical archive, promos)
      // so users can pick them directly from the expansion search
      fetch("/api/sets?all=true")
        .then((r) => r.json())
        .then((data) => setSets(data.sets ?? data))
        .catch(() => {});
    }
    if ((source === "tribe") && !tribes) {
      fetch("/api/tribes")
        .then((r) => r.json())
        .then((data) => setTribes(data.tribes ?? data))
        .catch(() => {});
    }
  }, [source, sets, tribes]);

  // Debounced search (only for sources that need entity selection)
  useEffect(() => {
    if (!needsSelection || !query.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        let results: SelectedItem[] = [];

        if (source === "card") {
          const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          results = (data.results ?? []).map((c: OracleCard & { illustration_count?: number }) => ({
            id: c.oracle_id,
            label: c.name + (c.illustration_count ? ` (${c.illustration_count} illustrations)` : ""),
          }));
        } else if (source === "expansion") {
          const q = query.toLowerCase();
          results = (sets ?? [])
            .filter((s) => s.name.toLowerCase().includes(q) || s.set_code.toLowerCase().includes(q))
            .slice(0, 20)
            .map((s) => ({ id: s.set_code, label: `${s.name} (${s.set_code.toUpperCase()})` }));
        } else if (source === "tribe") {
          const q = query.toLowerCase();
          results = (tribes ?? [])
            .filter((t) => t.tribe.toLowerCase().includes(q))
            .slice(0, 20)
            .map((t) => ({ id: t.tribe, label: `${t.tribe} (${t.card_count} cards)` }));
        } else if (source === "tag" || source === "art_tag") {
          const tagType = source === "art_tag" ? "illustration" : "oracle";
          const res = await fetch(`/api/tags?q=${encodeURIComponent(query)}&type=${tagType}`);
          const data = await res.json();
          results = (data.tags ?? []).map((t: Tag) => ({
            id: t.tag_id,
            label: `${t.label} (${t.usage_count} cards)`,
          }));
        } else if (source === "artist") {
          const res = await fetch(`/api/artists/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          results = (data.artists ?? []).map((a: Artist) => ({
            id: a.name,
            label: `${a.name} (${a.illustration_count} illustrations)`,
          }));
        }

        setSearchResults(results);
        setShowDropdown(results.length > 0);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, source, sets, tribes, needsSelection]);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowDropdown(false);
      if (subtypeRef.current && !subtypeRef.current.contains(e.target as Node))
        setShowSubtypeDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch live count
  const fetchCount = useCallback(async () => {
    // For sources that need selection, require it
    if (needsSelection && !selected) {
      setCount(null);
      return;
    }
    // For "all", require at least one filter
    if (source === "all" && !selectedColors.length && !selectedType && !selectedSubtype && !selectedRarity && !rulesText) {
      setCount(null);
      return;
    }

    setCountLoading(true);
    try {
      const params = new URLSearchParams({
        source: source === "art_tag" ? "tag" : source,
        source_id: selected?.id ?? "_all",
      });
      if (selectedColors.length > 0) params.set("colors", selectedColors.join(","));
      if (selectedType) params.set("type", selectedType);
      if (selectedSubtype) params.set("subtype", selectedSubtype);
      if (rulesText) params.set("rules_text", rulesText);
      if (selectedRarity) params.set("rarity", selectedRarity);
      if (source === "expansion" && includeChildren) params.set("include_children", "true");
      if (source === "expansion" && onlyNewCards) params.set("only_new_cards", "true");
      if (source === "expansion" && firstIllustrationOnly) params.set("first_illustration_only", "true");

      const res = await fetch(`/api/brew/count?${params}`);
      const data = await res.json();
      setCount(data.count ?? 0);
    } catch {
      setCount(null);
    }
    setCountLoading(false);
  }, [selected, source, selectedColors, selectedType, selectedSubtype, selectedRarity, rulesText, needsSelection, includeChildren, onlyNewCards, firstIllustrationOnly]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  const toggleColor = (c: string) => {
    setSelectedColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    clearPreview();
  };

  const showFilters = true;
  const showPoolSize = mode !== "bracket";

  // Auto-generated title: "Lorwyn Eclipsed Red Creature Gauntlet"
  const generatedName = (() => {
    const parts: string[] = [];

    // Source label (e.g., "Lorwyn Eclipsed", "Counterspell", "Mark Poole")
    if (selected) {
      parts.push(selected.label.split(" (")[0]);
    }

    // Filters
    if (selectedColors.length > 0) {
      parts.push(selectedColors.map((c) => COLOR_LABELS[c]).join(" "));
    }
    if (selectedRarity) {
      const r = RARITIES.find((x) => x.value === selectedRarity);
      if (r) parts.push(r.label);
    }
    if (selectedType) parts.push(selectedType);
    if (selectedSubtype) parts.push(selectedSubtype);
    if (rulesText) parts.push(`"${rulesText}"`);

    // Mode last
    parts.push(MODE_LABELS[mode]);

    // Need at least a source or filter beyond just the mode
    return parts.length > 1 ? parts.join(" ") : "";
  })();

  const hasFiltersOrSelection =
    (needsSelection && selected !== null) ||
    (!needsSelection && (selectedColors.length > 0 || selectedType || selectedSubtype || selectedRarity || rulesText));

  // Effective bracket size for validation + submission. BRACKET_ALL uses the
  // live count; otherwise use the selected power-of-2.
  const effectiveBracketSize = bracketSize === BRACKET_ALL ? (count ?? 0) : bracketSize;
  const minCountForMode = mode === "bracket" ? Math.max(2, bracketSize === BRACKET_ALL ? 2 : bracketSize) : 2;
  const canCreate = hasFiltersOrSelection && generatedName.length > 0 && (count === null || count >= minCountForMode);

  // Auto-shrink bracket size if count drops below it (only for fixed sizes —
  // "All" always fits by definition)
  useEffect(() => {
    if (mode !== "bracket" || count === null || bracketSize === BRACKET_ALL) return;
    if (count < bracketSize) {
      const fit = [...BRACKET_SIZES].reverse().find((s) => s <= count);
      if (fit && fit !== bracketSize) setBracketSize(fit);
    }
  }, [count, mode, bracketSize]);

  const buildBrewPayload = () => ({
    mode,
    source: source === "art_tag" ? "tag" : source,
    source_id: selected?.id ?? "_all",
    colors: selectedColors.length > 0 ? selectedColors : null,
    card_type: selectedType || null,
    subtype: selectedSubtype || null,
    rules_text: rulesText || null,
    rarity: selectedRarity || null,
    pool_size: mode === "bracket" ? effectiveBracketSize : poolSize,
    bracket_size: mode === "bracket" ? effectiveBracketSize : null,
    include_children: source === "expansion" ? includeChildren : null,
    only_new_cards: source === "expansion" ? onlyNewCards : null,
    first_illustration_only: source === "expansion" ? firstIllustrationOnly : null,
  });

  const buildSourceLabel = () => {
    if (source === "all") {
      const parts: string[] = [];
      if (selectedColors.length > 0) parts.push(selectedColors.map(c => COLOR_LABELS[c]).join(", "));
      if (selectedType) parts.push(selectedType);
      if (selectedSubtype) parts.push(selectedSubtype);
      return parts.join(" ") || "All Cards";
    }
    return selected!.label.split(" (")[0];
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/brew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildBrewPayload(),
          name: generatedName,
          source_label: buildSourceLabel(),
          is_public: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create brew");
      }

      const { slug } = await res.json();
      router.push(`/brew/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create brew");
    }
    setSubmitting(false);
  };

  // Filtered subtypes for dropdown
  const filteredSubtypes = selectedSubtype.trim()
    ? COMMON_SUBTYPES.filter((s) => s.toLowerCase().includes(selectedSubtype.toLowerCase()))
    : COMMON_SUBTYPES;

  return (
    <div className="space-y-6">
      {/* Live title preview */}
      {generatedName && (
        <div className="text-center py-2">
          <p className="text-lg font-bold text-white">{generatedName}</p>
        </div>
      )}

      {/* Mode toggle */}
      <div>
        <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">Mode</label>
        <div className="flex gap-2">
          {(["bracket", "gauntlet"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                clearPreview();
                // If current source isn't supported by new mode, reset to "all"
                if (!MODE_SOURCES[m].includes(source)) {
                  setSource("all");
                  setSelected(null);
                  setQuery("");
                }
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                mode === m
                  ? "bg-amber-500 text-gray-900"
                  : "bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Source tabs */}
      <div>
        <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">Source</label>
        <div className="flex flex-wrap gap-2">
          {MODE_SOURCES[mode].map((s) => (
            <button
              key={s}
              onClick={() => handleSourceChange(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                source === s
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300 cursor-pointer"
              }`}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Source search (hidden for "all") */}
      {needsSelection && (
        <div ref={searchRef} className="relative">
          <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">
            {SOURCE_LABELS[source]}
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder={`Search ${SOURCE_LABELS[source].toLowerCase()}s...`}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
          />
          {searching && (
            <div className="absolute right-3 top-[38px] text-gray-500 text-sm">...</div>
          )}

          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelected(item);
                    setQuery(item.label);
                    setShowDropdown(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-700 transition-colors text-gray-200 first:rounded-t-lg last:rounded-b-lg cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm">
                {selected.label.split(" (")[0]}
                <button
                  onClick={() => {
                    setSelected(null);
                    setQuery("");
                  }}
                  className="hover:text-amber-200 ml-1 cursor-pointer"
                >
                  &times;
                </button>
              </span>
            </div>
          )}

          {source === "expansion" && selected && (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={includeChildren}
                  onChange={(e) => {
                    setIncludeChildren(e.target.checked);
                    clearPreview();
                  }}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
                Include child sets (commander, tokens, mystical archive, etc.)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={onlyNewCards}
                  onChange={(e) => {
                    setOnlyNewCards(e.target.checked);
                    clearPreview();
                  }}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
                Only new cards (exclude reprints)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={firstIllustrationOnly}
                  onChange={(e) => {
                    setFirstIllustrationOnly(e.target.checked);
                    clearPreview();
                  }}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
                First illustration per card (skip showcase/borderless/alt arts)
              </label>
            </div>
          )}
        </div>
      )}

      {/* Filters section */}
      {showFilters && (
        <div className="space-y-4 p-4 bg-gray-900/50 rounded-xl border border-gray-800">
          <label className="text-xs uppercase tracking-wider text-gray-500 block">Filters</label>

          {/* Colors */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Colors</label>
              {selectedColors.length > 0 && (
                <button onClick={() => { setSelectedColors([]); clearPreview(); }} className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">&times; Clear</button>
              )}
            </div>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleColor(c)}
                  title={COLOR_LABELS[c]}
                  className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                    selectedColors.includes(c)
                      ? "bg-amber-500 text-gray-900"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {COLOR_SYMBOLS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Type</label>
              {selectedType && (
                <button onClick={() => { setSelectedType(""); clearPreview(); }} className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">&times; Clear</button>
              )}
            </div>
            <select
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); clearPreview(); }}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 cursor-pointer"
            >
              <option value="">Any type</option>
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Rarity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Rarity</label>
              {selectedRarity && (
                <button onClick={() => { setSelectedRarity(""); clearPreview(); }} className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">&times; Clear</button>
              )}
            </div>
            <select
              value={selectedRarity}
              onChange={(e) => { setSelectedRarity(e.target.value); clearPreview(); }}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 cursor-pointer"
            >
              <option value="">Any rarity</option>
              {RARITIES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Subtype */}
          <div ref={subtypeRef} className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Subtype</label>
              {selectedSubtype && (
                <button onClick={() => { setSelectedSubtype(""); clearPreview(); }} className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">&times; Clear</button>
              )}
            </div>
            <input
              type="text"
              value={selectedSubtype}
              onChange={(e) => {
                setSelectedSubtype(e.target.value);
                setShowSubtypeDropdown(true);
                clearPreview();
              }}
              onFocus={() => setShowSubtypeDropdown(true)}
              placeholder="e.g. Elf, Dragon, Wizard..."
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
            {showSubtypeDropdown && filteredSubtypes.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {filteredSubtypes.map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setSelectedSubtype(st);
                      setShowSubtypeDropdown(false);
                      clearPreview();
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors text-gray-200 first:rounded-t-lg last:rounded-b-lg cursor-pointer"
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Rules text */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Rules text contains</label>
              {rulesText && (
                <button onClick={() => { setRulesText(""); clearPreview(); }} className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">&times; Clear</button>
              )}
            </div>
            <input
              type="text"
              value={rulesText}
              onChange={(e) => { setRulesText(e.target.value); clearPreview(); }}
              placeholder='e.g. "first strike", "Add {", "destroy target"...'
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      )}

      {/* Pool size (gauntlet mode) */}
      {showPoolSize && (
        <div>
          {(() => {
            const maxPool = count !== null && count > 0 ? Math.min(count, 50) : 50;
            const clampedSize = Math.min(poolSize, maxPool);
            if (clampedSize !== poolSize) setPoolSize(clampedSize);
            return (
              <>
                <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">
                  Pool size: {clampedSize}{count !== null && count <= 50 ? ` / ${count}` : ""}
                </label>
                <input
                  type="range"
                  min={3}
                  max={maxPool}
                  value={clampedSize}
                  onChange={(e) => setPoolSize(parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>3</span>
                  <span>{maxPool}</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Bracket size (bracket mode) */}
      {mode === "bracket" && (
        <div>
          <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">
            Bracket size
          </label>
          <div className="flex flex-wrap gap-2">
            {BRACKET_SIZES.map((size) => {
              const disabled = count !== null && count < size;
              const isSelected = bracketSize === size;
              return (
                <button
                  key={size}
                  onClick={() => {
                    if (!disabled) {
                      setBracketSize(size);
                      clearPreview();
                    }
                  }}
                  disabled={disabled}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isSelected
                      ? "bg-amber-500 text-gray-900"
                      : disabled
                      ? "bg-gray-900 text-gray-700 cursor-not-allowed"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
                  }`}
                >
                  {size}
                </button>
              );
            })}
            {/* "All" — use every matching card. Odd counts get a bye each round. */}
            {(() => {
              const disabled = count !== null && count < 2;
              const isSelected = bracketSize === BRACKET_ALL;
              return (
                <button
                  onClick={() => {
                    if (!disabled) {
                      setBracketSize(BRACKET_ALL);
                      clearPreview();
                    }
                  }}
                  disabled={disabled}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isSelected
                      ? "bg-amber-500 text-gray-900"
                      : disabled
                      ? "bg-gray-900 text-gray-700 cursor-not-allowed"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
                  }`}
                  title="Use every matching card — odd counts get byes"
                >
                  All{count !== null ? ` (${count})` : ""}
                </button>
              );
            })()}
          </div>
          {count !== null && count < 2 && (
            <p className="text-xs text-red-400 mt-2">Need at least 2 matching cards for a bracket.</p>
          )}
        </div>
      )}

      {/* Count + Preview button */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-sm text-gray-400">
          {hasFiltersOrSelection ? (
            countLoading ? (
              <span className="text-gray-500">Counting...</span>
            ) : count !== null ? (
              <span>
                <span className="text-white font-medium">{count.toLocaleString()}</span>{" "}
                {source === "card" || source === "artist" || source === "expansion" || source === "art_tag" ? "illustrations" : "cards"} match
              </span>
            ) : null
          ) : (
            <span className="text-gray-600">
              {needsSelection
                ? `Select a ${SOURCE_LABELS[source].toLowerCase()} to start`
                : "Add filters to narrow the pool"}
            </span>
          )}
        </div>

        <button
          onClick={handleCreate}
          disabled={!canCreate || submitting}
          className={`px-8 py-3 rounded-lg font-semibold text-sm transition-colors ${
            canCreate && !submitting
              ? "bg-amber-500 text-gray-900 hover:bg-amber-400 cursor-pointer"
              : "bg-gray-800 text-gray-600 cursor-not-allowed"
          }`}
        >
          {submitting ? "Creating..." : "Create Brew"}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
    </div>
  );
}
