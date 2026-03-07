import type { DecklistEntry, MoxfieldDeck } from "./types";

const SECTION_PATTERNS = [
  /^\/\/\s*(.+)$/,       // // Commander, // Sideboard
  /^(\w[\w\s]*):$/,      // SIDEBOARD:, Companion:
];

const CARD_LINE = /^(\d+)x?\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+\S+)?$/;

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
      entries.push({
        quantity: parseInt(cardMatch[1], 10),
        name: cardMatch[2].trim(),
        section: currentSection,
      });
    } else if (/^[A-Z]/.test(line) && !line.includes(":")) {
      // Bare card name (no quantity) — default to 1
      const nameOnly = line.replace(/\s+\([A-Z0-9]+\)\s+\S+$/, "").trim();
      if (nameOnly) {
        entries.push({
          quantity: 1,
          name: nameOnly,
          section: currentSection,
        });
      }
    }
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
