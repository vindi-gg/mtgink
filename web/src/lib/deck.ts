import type { DecklistEntry, MoxfieldDeck } from "./types";

const SECTION_PATTERNS = [
  /^\/\/\s*(.+)$/,       // // Commander, // Sideboard
  /^(\w[\w\s]*):$/,      // SIDEBOARD:, Companion:
];

// Matches: "4 Lightning Bolt", "1 Narset (MAT) 173 *F*", "2x Counterspell"
const CARD_LINE = /^(\d+)x?\s+(.+?)(?:\s+\(([A-Z0-9]+)\)\s+(\S+)(.*))?$/;

/** Normalize Moxfield single-slash split names to Scryfall double-slash */
function normalizeName(name: string): string {
  return name.replace(/\s+\/\s+/g, " // ");
}

export function parseDeckList(text: string): DecklistEntry[] {
  const entries: DecklistEntry[] = [];
  let currentSection = "Mainboard";

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check for section header
    let isSection = false;
    for (const pattern of SECTION_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        currentSection = match[1].trim();
        isSection = true;
        break;
      }
    }
    if (isSection) continue;

    // Try to parse as a card line
    const cardMatch = line.match(CARD_LINE);
    if (cardMatch) {
      const entry: DecklistEntry = {
        quantity: parseInt(cardMatch[1], 10),
        name: normalizeName(cardMatch[2].trim()),
        section: currentSection,
      };
      if (cardMatch[3]) {
        entry.original_set_code = cardMatch[3].toLowerCase();
        entry.original_collector_number = cardMatch[4];
        entry.original_is_foil = cardMatch[5]?.includes("*F*") ?? false;
      }
      entries.push(entry);
    } else if (/^[A-Z]/.test(line) && !line.includes(":")) {
      // Bare card name (no quantity) — default to 1
      const nameOnly = line.replace(/\s+\([A-Z0-9]+\)\s+.*$/, "").trim();
      if (nameOnly) {
        entries.push({
          quantity: 1,
          name: normalizeName(nameOnly),
          section: currentSection,
        });
      }
    }
  }

  // Moxfield format: if first card has set code and no explicit section headers
  // were used, assume the first card is the commander
  const hasSectionHeaders = entries.some((e) => e.section !== "Mainboard");
  const isMoxfieldFormat = entries.length > 0 && entries[0].original_set_code;
  if (isMoxfieldFormat && !hasSectionHeaders && entries[0].quantity === 1) {
    entries[0].section = "Commander";
  }

  return entries;
}

export function extractMoxfieldDeckId(url: string): string | null {
  const match = url.match(
    /moxfield\.com\/decks\/([A-Za-z0-9_-]+)/
  );
  return match ? match[1] : null;
}

export function parseMoxfieldResponse(data: MoxfieldDeck): DecklistEntry[] {
  const entries: DecklistEntry[] = [];

  const sectionMap: [Record<string, { quantity: number; card: { name: string } }>, string][] = [
    [data.commanders ?? {}, "Commander"],
    [data.companions ?? {}, "Companion"],
    [data.mainboard ?? {}, "Mainboard"],
    [data.sideboard ?? {}, "Sideboard"],
  ];

  for (const [cards, section] of sectionMap) {
    for (const entry of Object.values(cards)) {
      if (entry.quantity > 0 && entry.card?.name) {
        entries.push({
          quantity: entry.quantity,
          name: entry.card.name,
          section,
        });
      }
    }
  }

  return entries;
}
