"""Generate mechanically-derived ink tags from card data in Supabase Postgres.

Idempotent — deletes and regenerates all ink: tags each run.
Uses oracle_text, keywords, type_line, and cmc/power to derive tags.
"""

import json
import os
import re
import sys
import time

import psycopg2
from psycopg2.extras import execute_values

SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL")
BATCH_SIZE = 5000


def slugify(label):
    """Convert a tag label to a URL-friendly slug."""
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", label)
    return re.sub(r"\s+", "-", s).lower()


# ---------------------------------------------------------------------------
# Mechanic tag definitions (oracle_text regex patterns)
# ---------------------------------------------------------------------------

MECHANIC_TAGS = [
    {
        "tag_id": "ink:mana-producer",
        "label": "Mana Producer",
        "rule": r"(?i)\badd\b.*(?:\{[WUBRGCS]|mana\b)",
        "description": "Non-land cards that generate mana.",
        "exclude_types": ["Land"],
    },
    {
        "tag_id": "ink:mana-dork",
        "label": "Mana Dork",
        "rule": r"(?i)\{T\}.*\badd\b.*(?:\{[WUBRGCS]|mana\b)",
        "description": "Low-cost creatures with their own tap ability that produces mana (CMC <= 3).",
        "exclude_granted": True,
        "require_types": ["Creature"],
        "front_face_only": True,
        "max_cmc": 3,
    },
    {
        "tag_id": "ink:card-draw",
        "label": "Card Draw",
        "rule": r"(?i)draws? (?:a )?cards?|draw [Xx] cards",
        "description": "Cards that draw cards.",
    },
    {
        "tag_id": "ink:removal",
        "label": "Removal",
        "rule": r"(?i)(?:destroy|exile) target (?:creature|permanent|artifact|enchantment|planeswalker|nonland permanent)",
        "description": "Cards that destroy or exile a targeted permanent.",
    },
    {
        "tag_id": "ink:counterspell",
        "label": "Counterspell",
        "rule": r"(?i)counter target spell",
        "description": "Cards that counter spells.",
    },
    {
        "tag_id": "ink:board-wipe",
        "label": "Board Wipe",
        "rule": r"(?i)(?:destroy|exile) all (?:creatures|permanents|nonland permanents|artifacts|enchantments)",
        "description": "Cards that destroy or exile all creatures/permanents.",
    },
    {
        "tag_id": "ink:tutor",
        "label": "Tutor",
        "rule": r"(?i)search your library",
        "description": "Cards that search your library.",
    },
    {
        "tag_id": "ink:token-maker",
        "label": "Token Maker",
        "rule": r"(?i)creates? [\w\s]* tokens?",
        "description": "Cards that create tokens.",
    },
    {
        "tag_id": "ink:ramp",
        "label": "Ramp",
        "rule": r"(?i)search (?:your|their) library (?:for )?(?:[\w\s]*)?(?:a |an )?(?:basic )?land",
        "description": "Cards that search for lands (mana ramp).",
    },
    {
        "tag_id": "ink:mill",
        "label": "Mill",
        "rule": r"(?i)\bmill\b",
        "description": "Cards with the mill mechanic.",
    },
    {
        "tag_id": "ink:lifegain",
        "label": "Lifegain",
        "rule": r"(?i)gains? [\w\s]* life|you gain life",
        "description": "Cards that gain life.",
    },
    {
        "tag_id": "ink:sacrifice-outlet",
        "label": "Sacrifice Outlet",
        "rule": r"(?i)sacrifice (?:a|another|an) ",
        "description": "Cards that let you sacrifice permanents as a cost or effect.",
    },
    {
        "tag_id": "ink:graveyard-recursion",
        "label": "Recursion",
        "rule": r"(?i)return [\w\s]* from [\w\s]* graveyard",
        "description": "Cards that return things from graveyards.",
    },
    {
        "tag_id": "ink:discard",
        "label": "Discard",
        "rule": r"(?i)(?:target|each) (?:opponent|player) discards",
        "description": "Cards that force opponents to discard.",
    },
    {
        "tag_id": "ink:pump",
        "label": "Pump",
        "rule": r"(?i)gets? [+-]\d+/[+-]\d+",
        "description": "Cards that give power/toughness bonuses.",
    },
    {
        "tag_id": "ink:cantrip",
        "label": "Cantrip",
        "rule": r"(?i)draw a card",
        "description": "Non-creature spells that draw a card.",
        "exclude_types": ["Creature"],
    },
    {
        "tag_id": "ink:etb-trigger",
        "label": "ETB Trigger",
        "rule": r"(?i)(?:when .* enters|enters the battlefield)",
        "description": "Cards with enters-the-battlefield triggers.",
    },
]

# ---------------------------------------------------------------------------
# Type-derived tag definitions
# ---------------------------------------------------------------------------

TYPE_TAGS = [
    {"tag_id": "ink:legendary", "label": "Legendary", "match": "Legendary"},
    {"tag_id": "ink:equipment", "label": "Equipment", "match": "Equipment"},
    {"tag_id": "ink:aura", "label": "Aura", "match": "Aura"},
    {"tag_id": "ink:saga", "label": "Saga", "match": "Saga"},
    {"tag_id": "ink:vehicle", "label": "Vehicle", "match": "Vehicle"},
    {"tag_id": "ink:planeswalker", "label": "Planeswalker", "match": "Planeswalker"},
    {"tag_id": "ink:land", "label": "Land", "match": "Land"},
    {"tag_id": "ink:token", "label": "Token", "match": "Token"},
    {
        "tag_id": "ink:artifact-creature",
        "label": "Artifact Creature",
        "match_all": ["Artifact", "Creature"],
    },
    {
        "tag_id": "ink:enchantment-creature",
        "label": "Enchantment Creature",
        "match_all": ["Enchantment", "Creature"],
    },
]

# ---------------------------------------------------------------------------
# Stat-based tag definitions
# ---------------------------------------------------------------------------

STAT_TAGS = [
    {
        "tag_id": "ink:one-drop",
        "label": "One-Drop",
        "description": "Creatures with mana value 1.",
        "cmc": 1,
        "require_type": "Creature",
    },
    {
        "tag_id": "ink:two-drop",
        "label": "Two-Drop",
        "description": "Creatures with mana value 2.",
        "cmc": 2,
        "require_type": "Creature",
    },
    {
        "tag_id": "ink:three-drop",
        "label": "Three-Drop",
        "description": "Creatures with mana value 3.",
        "cmc": 3,
        "require_type": "Creature",
    },
    {
        "tag_id": "ink:finisher",
        "label": "Finisher",
        "description": "Creatures with power 6 or greater.",
        "min_power": 6,
        "require_type": "Creature",
    },
    {
        "tag_id": "ink:big-spell",
        "label": "Big Spell",
        "description": "Spells with mana value 7 or greater.",
        "min_cmc": 7,
        "exclude_type": "Land",
    },
    {
        "tag_id": "ink:free-spell",
        "label": "Free Spell",
        "description": "Non-land, non-token cards with mana value 0.",
        "cmc": 0,
        "exclude_type": "Land",
        "exclude_layout": ["token", "double_faced_token"],
    },
]


def get_oracle_text(card, faces_by_oracle):
    """Get combined oracle text for a card, including DFC faces."""
    texts = []
    if card["oracle_text"]:
        texts.append(card["oracle_text"])
    # Add card_faces oracle_text for DFCs
    for face in faces_by_oracle.get(str(card["oracle_id"]), []):
        if face["oracle_text"]:
            texts.append(face["oracle_text"])
    return "\n".join(texts) if texts else ""


def get_front_face_text(card, faces_by_oracle):
    """Get only the front face oracle text (face_index=0)."""
    # If the card has card_faces, use face_index=0
    faces = faces_by_oracle.get(str(card["oracle_id"]), [])
    for face in faces:
        if face["face_index"] == 0 and face["oracle_text"]:
            return face["oracle_text"]
    # Fallback to oracle_cards.oracle_text (non-DFC cards)
    return card.get("oracle_text") or ""


def parse_power(power_str):
    """Parse power string to int, returns None for non-numeric (e.g. '*')."""
    if not power_str:
        return None
    try:
        return int(power_str)
    except (ValueError, TypeError):
        return None


def generate(conn):
    cur = conn.cursor()

    # -----------------------------------------------------------------------
    # Load card data
    # -----------------------------------------------------------------------
    print("Loading oracle_cards...")
    cur.execute(
        "SELECT oracle_id, name, type_line, oracle_text, keywords, cmc, power, layout "
        "FROM oracle_cards WHERE layout != 'art_series'"
    )
    columns = [desc[0] for desc in cur.description]
    cards = [dict(zip(columns, row)) for row in cur.fetchall()]
    print(f"  {len(cards):,} cards loaded")

    print("Loading card_faces...")
    cur.execute(
        "SELECT DISTINCT p.oracle_id, cf.face_index, cf.oracle_text "
        "FROM card_faces cf "
        "JOIN printings p ON cf.scryfall_id = p.scryfall_id"
    )
    face_cols = [desc[0] for desc in cur.description]
    faces_raw = [dict(zip(face_cols, row)) for row in cur.fetchall()]
    faces_by_oracle = {}
    for f in faces_raw:
        faces_by_oracle.setdefault(str(f["oracle_id"]), []).append(f)
    print(f"  {len(faces_raw):,} faces loaded")

    # -----------------------------------------------------------------------
    # Clear existing ink tags
    # -----------------------------------------------------------------------
    print("Clearing existing ink tags...")
    cur.execute("DELETE FROM oracle_tags WHERE tag_id LIKE 'ink:%'")
    cur.execute("DELETE FROM illustration_tags WHERE tag_id LIKE 'ink:%'")
    cur.execute("DELETE FROM tags WHERE tag_id LIKE 'ink:%'")
    conn.commit()

    # Collect all tag definitions and oracle_id associations
    tag_defs = {}  # tag_id -> {label, slug, type, description, source, rule_definition, category}
    tag_oracle_ids = {}  # tag_id -> set of oracle_ids

    # -----------------------------------------------------------------------
    # 1. Keyword tags (from keywords JSONB)
    # -----------------------------------------------------------------------
    print("Generating keyword tags...")
    keyword_counts = {}
    for card in cards:
        kw_raw = card.get("keywords")
        if not kw_raw:
            continue
        # keywords is JSONB — psycopg2 may return it as list or string
        if isinstance(kw_raw, str):
            keywords = json.loads(kw_raw)
        else:
            keywords = kw_raw
        for kw in keywords:
            kw_lower = kw.lower()
            tag_id = f"ink:{slugify(kw_lower)}"
            if tag_id not in tag_defs:
                tag_defs[tag_id] = {
                    "label": kw,
                    "slug": slugify(f"ink-{kw_lower}"),
                    "type": "oracle",
                    "description": f"Cards with the {kw} keyword.",
                    "source": "ink",
                    "rule_definition": f'keywords array contains "{kw}"',
                    "category": "keyword",
                }
                tag_oracle_ids[tag_id] = set()
            keyword_counts[tag_id] = keyword_counts.get(tag_id, 0) + 1
            tag_oracle_ids[tag_id].add(card["oracle_id"])
    print(f"  {len([t for t in tag_defs if tag_defs[t]['category'] == 'keyword'])} keyword tags")

    # -----------------------------------------------------------------------
    # 2. Mechanic tags (oracle_text regex)
    # -----------------------------------------------------------------------
    print("Generating mechanic tags...")
    for mtag in MECHANIC_TAGS:
        tag_id = mtag["tag_id"]
        tag_defs[tag_id] = {
            "label": mtag["label"],
            "slug": slugify(f"ink-{mtag['label'].lower()}"),
            "type": "oracle",
            "description": mtag.get("description"),
            "source": "ink",
            "rule_definition": mtag["rule"],
            "category": "mechanic",
        }
        tag_oracle_ids[tag_id] = set()
        pattern = re.compile(mtag["rule"])
        exclude_types = mtag.get("exclude_types", [])

        require_types = mtag.get("require_types", [])
        front_face_only = mtag.get("front_face_only", False)
        exclude_granted = mtag.get("exclude_granted", False)
        max_cmc = mtag.get("max_cmc")

        for card in cards:
            tl = card.get("type_line") or ""
            # For front_face_only, check type against front face only (before //)
            check_tl = tl.split("//")[0].strip() if front_face_only else tl

            # Check type exclusions
            if exclude_types and check_tl:
                if any(et in check_tl for et in exclude_types):
                    continue

            # Check type requirements
            if require_types:
                if not all(rt in check_tl for rt in require_types):
                    continue

            # Check max CMC
            if max_cmc is not None:
                cmc = card.get("cmc")
                if cmc is None or float(cmc) > max_cmc:
                    continue

            text = get_front_face_text(card, faces_by_oracle) if front_face_only else get_oracle_text(card, faces_by_oracle)
            if not text:
                continue
            # exclude_granted: skip if the match is inside a granted ability ("have/gain")
            if exclude_granted:
                # Check each line — skip lines where "have" or "gain" precedes {T}
                matched = False
                for line in text.split("\n"):
                    if pattern.search(line):
                        t_pos = line.find("{T}")
                        before = line[:t_pos].lower() if t_pos >= 0 else ""
                        if "have" not in before and "gain" not in before:
                            matched = True
                            break
                if not matched:
                    continue
            elif not pattern.search(text):
                continue
            tag_oracle_ids[tag_id].add(card["oracle_id"])

    mechanic_count = len([t for t in tag_defs if tag_defs[t]["category"] == "mechanic"])
    print(f"  {mechanic_count} mechanic tags")

    # -----------------------------------------------------------------------
    # 3. Type-derived tags
    # -----------------------------------------------------------------------
    print("Generating type tags...")
    for ttag in TYPE_TAGS:
        tag_id = ttag["tag_id"]
        tag_defs[tag_id] = {
            "label": ttag["label"],
            "slug": slugify(f"ink-{ttag['label'].lower()}"),
            "type": "oracle",
            "description": f'Cards with "{ttag["label"]}" in their type line.',
            "source": "ink",
            "rule_definition": f'type_line contains "{ttag.get("match", ttag.get("match_all"))}"',
            "category": "type",
        }
        tag_oracle_ids[tag_id] = set()

        for card in cards:
            tl = card.get("type_line") or ""
            if "match_all" in ttag:
                if all(m in tl for m in ttag["match_all"]):
                    tag_oracle_ids[tag_id].add(card["oracle_id"])
            elif ttag["match"] in tl:
                tag_oracle_ids[tag_id].add(card["oracle_id"])

    type_count = len([t for t in tag_defs if tag_defs[t]["category"] == "type"])
    print(f"  {type_count} type tags")

    # -----------------------------------------------------------------------
    # 4. Stat-based tags
    # -----------------------------------------------------------------------
    print("Generating stat tags...")
    for stag in STAT_TAGS:
        tag_id = stag["tag_id"]
        tag_defs[tag_id] = {
            "label": stag["label"],
            "slug": slugify(f"ink-{stag['label'].lower()}"),
            "type": "oracle",
            "description": stag.get("description"),
            "source": "ink",
            "rule_definition": (
                f"cmc={stag.get('cmc', stag.get('min_cmc', ''))}"
                + (f", power>={stag['min_power']}" if "min_power" in stag else "")
                + (f", requires {stag['require_type']}" if "require_type" in stag else "")
                + (f", excludes {stag['exclude_type']}" if "exclude_type" in stag else "")
            ),
            "category": "stat",
        }
        tag_oracle_ids[tag_id] = set()

        for card in cards:
            tl = card.get("type_line") or ""
            cmc = card.get("cmc")

            # Layout exclusions
            if "exclude_layout" in stag:
                if card.get("layout") in stag["exclude_layout"]:
                    continue

            # Type requirements
            if "require_type" in stag and stag["require_type"] not in tl:
                continue
            if "exclude_type" in stag and stag["exclude_type"] in tl:
                continue

            # CMC exact match
            if "cmc" in stag:
                if cmc is not None and float(cmc) == stag["cmc"]:
                    tag_oracle_ids[tag_id].add(card["oracle_id"])

            # CMC minimum
            elif "min_cmc" in stag:
                if cmc is not None and float(cmc) >= stag["min_cmc"]:
                    tag_oracle_ids[tag_id].add(card["oracle_id"])

            # Power minimum
            elif "min_power" in stag:
                power = parse_power(card.get("power"))
                if power is not None and power >= stag["min_power"]:
                    tag_oracle_ids[tag_id].add(card["oracle_id"])

    stat_count = len([t for t in tag_defs if tag_defs[t]["category"] == "stat"])
    print(f"  {stat_count} stat tags")

    # -----------------------------------------------------------------------
    # Insert tags
    # -----------------------------------------------------------------------
    print(f"\nInserting {len(tag_defs)} ink tags...")
    tag_rows = [
        (
            tag_id,
            d["label"],
            d["slug"],
            d["type"],
            d["description"],
            d["source"],
            d["rule_definition"],
            d["category"],
        )
        for tag_id, d in tag_defs.items()
    ]
    execute_values(
        cur,
        """INSERT INTO tags (tag_id, label, slug, type, description, source, rule_definition, category)
           VALUES %s
           ON CONFLICT (tag_id) DO UPDATE SET
             label = EXCLUDED.label,
             slug = EXCLUDED.slug,
             description = EXCLUDED.description,
             source = EXCLUDED.source,
             rule_definition = EXCLUDED.rule_definition,
             category = EXCLUDED.category""",
        tag_rows,
    )
    conn.commit()

    # -----------------------------------------------------------------------
    # Insert oracle_tags associations
    # -----------------------------------------------------------------------
    print("Inserting oracle_tags associations...")
    assoc_rows = []
    for tag_id, oracle_ids in tag_oracle_ids.items():
        for oid in oracle_ids:
            assoc_rows.append((str(oid), tag_id))

    total_assoc = len(assoc_rows)
    for i in range(0, total_assoc, BATCH_SIZE):
        batch = assoc_rows[i : i + BATCH_SIZE]
        execute_values(
            cur,
            """INSERT INTO oracle_tags (oracle_id, tag_id)
               SELECT v.oracle_id::UUID, v.tag_id
               FROM (VALUES %s) AS v(oracle_id, tag_id)
               WHERE EXISTS (SELECT 1 FROM oracle_cards oc WHERE oc.oracle_id = v.oracle_id::UUID)
               ON CONFLICT DO NOTHING""",
            batch,
        )
        conn.commit()
        print(
            f"\r  oracle_tags: {min(i + BATCH_SIZE, total_assoc):,}/{total_assoc:,}",
            end="",
            flush=True,
        )
    print()

    # -----------------------------------------------------------------------
    # Update usage_count for ink tags
    # -----------------------------------------------------------------------
    print("Updating usage_count for ink tags...")
    cur.execute("""
        UPDATE tags SET usage_count = COALESCE(sub.cnt, 0)
        FROM (
            SELECT tag_id, COUNT(*) AS cnt FROM oracle_tags
            WHERE tag_id LIKE 'ink:%%'
            GROUP BY tag_id
        ) sub
        WHERE tags.tag_id = sub.tag_id
    """)
    conn.commit()

    # -----------------------------------------------------------------------
    # Deduplicate slugs (in case ink slugs collide with scryfall ones)
    # -----------------------------------------------------------------------
    cur.execute("""
        UPDATE tags SET slug = slug || '-ink'
        WHERE source = 'ink'
          AND slug IN (
            SELECT slug FROM tags GROUP BY slug HAVING COUNT(*) > 1
          )
    """)
    conn.commit()

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    cur.execute("SELECT COUNT(*) FROM tags WHERE source = 'ink'")
    ink_tag_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM oracle_tags WHERE tag_id LIKE 'ink:%%'")
    ink_assoc_count = cur.fetchone()[0]

    cur.execute(
        "SELECT category, COUNT(*) FROM tags WHERE source = 'ink' GROUP BY category ORDER BY category"
    )
    cat_counts = cur.fetchall()

    print(f"\n=== Ink Tag Generation Summary ===")
    print(f"  Total ink tags: {ink_tag_count:,}")
    print(f"  Total oracle_tags associations: {ink_assoc_count:,}")
    print(f"  By category:")
    for cat, cnt in cat_counts:
        print(f"    {cat}: {cnt}")

    # Spot checks
    cur.execute("""
        SELECT t.label FROM oracle_tags ot
        JOIN tags t ON ot.tag_id = t.tag_id
        JOIN oracle_cards oc ON ot.oracle_id = oc.oracle_id
        WHERE oc.name = 'Llanowar Elves' AND t.source = 'ink'
        ORDER BY t.label
    """)
    rows = cur.fetchall()
    if rows:
        labels = [r[0] for r in rows]
        print(f"\n  Llanowar Elves ink tags: {', '.join(labels)}")

    cur.execute("""
        SELECT t.label FROM oracle_tags ot
        JOIN tags t ON ot.tag_id = t.tag_id
        JOIN oracle_cards oc ON ot.oracle_id = oc.oracle_id
        WHERE oc.name = 'Garth One-Eye' AND t.source = 'ink'
        ORDER BY t.label
    """)
    rows = cur.fetchall()
    if rows:
        labels = [r[0] for r in rows]
        print(f"  Garth One-Eye ink tags: {', '.join(labels)}")

    cur.execute("""
        SELECT t.label FROM oracle_tags ot
        JOIN tags t ON ot.tag_id = t.tag_id
        JOIN oracle_cards oc ON ot.oracle_id = oc.oracle_id
        WHERE oc.name = 'Counterspell' AND t.source = 'ink'
        ORDER BY t.label
    """)
    rows = cur.fetchall()
    if rows:
        labels = [r[0] for r in rows]
        print(f"  Counterspell ink tags: {', '.join(labels)}")

    cur.close()


def main():
    if not SUPABASE_DB_URL:
        print("ERROR: Set SUPABASE_DB_URL environment variable")
        print(
            "  export SUPABASE_DB_URL=$(grep SUPABASE_DB_URL web/.env.prod | cut -d= -f2-)"
        )
        sys.exit(1)

    start = time.time()

    conn = psycopg2.connect(SUPABASE_DB_URL)
    generate(conn)
    conn.close()

    elapsed = time.time() - start
    print(f"\nTotal time: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
