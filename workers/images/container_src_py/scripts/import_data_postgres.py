#!/usr/bin/env python3
"""Import Scryfall bulk data into Supabase Postgres."""

import json
import os
import re
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

BULK_DIR = Path(__file__).parent.parent / "data" / "bulk"
SUPABASE_DB_URL = os.environ["SUPABASE_DB_URL"]


def slugify(name):
    """Convert a card name to a URL slug (matches TypeScript slugify)."""
    s = name.lower()
    s = s.replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s


def compute_slugs(oracle_cards):
    """Pre-compute slugs for all oracle cards, disambiguating duplicates."""
    # Group cards by name
    by_name = {}
    for card in oracle_cards:
        name = card.get("name", "")
        by_name.setdefault(name, []).append(card)

    slugs = {}
    for name, cards in by_name.items():
        base = slugify(name)

        if len(cards) == 1:
            slugs[cards[0]["oracle_id"]] = base
            continue

        # Multiple cards with same name — disambiguate
        tokens = [c for c in cards if (c.get("type_line") or "").startswith("Token")]
        non_tokens = [c for c in cards if not (c.get("type_line") or "").startswith("Token")]

        # Non-tokens
        if len(non_tokens) == 1:
            slugs[non_tokens[0]["oracle_id"]] = base
        else:
            for c in non_tokens:
                slugs[c["oracle_id"]] = f"{base}-{c['oracle_id'][:8]}"

        # Tokens
        if len(tokens) == 1:
            slugs[tokens[0]["oracle_id"]] = f"{base}-token"
        else:
            for c in tokens:
                slugs[c["oracle_id"]] = f"{base}-token-{c['oracle_id'][:8]}"

    return slugs


def import_sets(cur, conn):
    """Import sets from sets.json."""
    sets_file = BULK_DIR / "sets.json"
    if not sets_file.exists():
        print(f"ERROR: {sets_file} not found. Run download_bulk.py first.")
        sys.exit(1)

    with open(sets_file) as f:
        sets_data = json.load(f)

    print(f"Importing {len(sets_data)} sets...")

    values = [
        (
            s["code"],
            s["id"],
            s["name"],
            s.get("set_type"),
            s.get("released_at"),
            s.get("card_count"),
            s.get("printed_size"),
            s.get("icon_svg_uri"),
            s.get("parent_set_code"),
            s.get("block_code"),
            s.get("block"),
            bool(s.get("digital")),
        )
        for s in sets_data
    ]

    execute_values(
        cur,
        """INSERT INTO sets (set_code, set_id, name, set_type, released_at, card_count,
                             printed_size, icon_svg_uri, parent_set_code, block_code, block, digital)
           VALUES %s
           ON CONFLICT (set_code) DO UPDATE SET
             name = EXCLUDED.name, set_type = EXCLUDED.set_type,
             released_at = EXCLUDED.released_at, card_count = EXCLUDED.card_count,
             icon_svg_uri = EXCLUDED.icon_svg_uri, digital = EXCLUDED.digital""",
        values,
    )
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM sets")
    print(f"  Imported {cur.fetchone()[0]} sets")


def import_oracle_cards(cur, conn, slugs):
    """Import oracle cards with pre-computed slugs."""
    oracle_file = BULK_DIR / "oracle_cards.json"
    if not oracle_file.exists():
        print(f"WARNING: {oracle_file} not found, will derive from printings")
        return

    with open(oracle_file) as f:
        cards = json.load(f)

    print(f"Importing {len(cards)} oracle cards...")

    batch = []
    for card in cards:
        oid = card.get("oracle_id")
        if not oid:
            continue

        batch.append((
            oid,
            card.get("name", ""),
            slugs.get(oid, slugify(card.get("name", ""))),
            card.get("layout"),
            card.get("mana_cost"),
            card.get("cmc"),
            card.get("type_line"),
            card.get("oracle_text"),
            json.dumps(card.get("colors") or []),
            json.dumps(card.get("color_identity") or []),
            json.dumps(card.get("keywords") or []),
            card.get("power"),
            card.get("toughness"),
            card.get("loyalty"),
            card.get("defense"),
            json.dumps(card.get("legalities") or {}),
            bool(card.get("reserved")),
        ))

        if len(batch) >= 5000:
            _insert_oracle_batch(cur, conn, batch)
            batch = []

    if batch:
        _insert_oracle_batch(cur, conn, batch)

    cur.execute("SELECT COUNT(*) FROM oracle_cards")
    print(f"  Imported {cur.fetchone()[0]} oracle cards")


def _insert_oracle_batch(cur, conn, batch):
    execute_values(
        cur,
        """INSERT INTO oracle_cards
           (oracle_id, name, slug, layout, mana_cost, cmc, type_line, oracle_text,
            colors, color_identity, keywords, power, toughness, loyalty, defense,
            legalities, reserved)
           VALUES %s
           ON CONFLICT (oracle_id) DO UPDATE SET
             name = EXCLUDED.name, slug = EXCLUDED.slug, layout = EXCLUDED.layout,
             type_line = EXCLUDED.type_line, colors = EXCLUDED.colors,
             mana_cost = EXCLUDED.mana_cost, cmc = EXCLUDED.cmc""",
        batch,
    )
    conn.commit()


def import_printings(cur, conn, slugs):
    """Import all printings from default_cards.json."""
    cards_file = BULK_DIR / "default_cards.json"
    if not cards_file.exists():
        print(f"ERROR: {cards_file} not found. Run download_bulk.py first.")
        sys.exit(1)

    print(f"Loading printings from {cards_file}...")
    with open(cards_file) as f:
        cards = json.load(f)

    print(f"Importing {len(cards)} printings...")

    # Ensure all oracle_ids exist
    oracle_batch = []
    oracle_seen = set()
    for card in cards:
        oid = card.get("oracle_id")
        if not oid:
            if card.get("card_faces"):
                oid = card["card_faces"][0].get("oracle_id")
        if oid and oid not in oracle_seen:
            oracle_seen.add(oid)
            oracle_batch.append((
                oid,
                card.get("name", ""),
                slugs.get(oid, slugify(card.get("name", ""))),
                card.get("layout"),
                card.get("mana_cost"),
                card.get("cmc"),
                card.get("type_line"),
                card.get("oracle_text"),
                json.dumps(card.get("colors") or []),
                json.dumps(card.get("color_identity") or []),
                json.dumps(card.get("keywords") or []),
                card.get("power"),
                card.get("toughness"),
                card.get("loyalty"),
                card.get("defense"),
                json.dumps(card.get("legalities") or {}),
                bool(card.get("reserved")),
            ))

    # Batch insert oracle cards (ON CONFLICT DO NOTHING — prefer existing oracle data)
    for i in range(0, len(oracle_batch), 5000):
        execute_values(
            cur,
            """INSERT INTO oracle_cards
               (oracle_id, name, slug, layout, mana_cost, cmc, type_line, oracle_text,
                colors, color_identity, keywords, power, toughness, loyalty, defense,
                legalities, reserved)
               VALUES %s ON CONFLICT (oracle_id) DO NOTHING""",
            oracle_batch[i:i + 5000],
        )
        conn.commit()

    # Import printings
    count = 0
    skipped = 0
    batch = []
    face_batch = []

    for card in cards:
        oracle_id = card.get("oracle_id")
        if not oracle_id:
            if card.get("card_faces"):
                oracle_id = card["card_faces"][0].get("oracle_id")
            if not oracle_id:
                skipped += 1
                continue

        image_uris = card.get("image_uris") or {}
        if not image_uris and card.get("card_faces"):
            image_uris = card["card_faces"][0].get("image_uris") or {}

        prices = card.get("prices") or {}
        purchase = card.get("purchase_uris") or {}

        batch.append((
            card["id"],
            oracle_id,
            card.get("set", ""),
            card.get("collector_number", ""),
            card.get("name", ""),
            card.get("flavor_name"),
            card.get("layout"),
            card.get("mana_cost"),
            card.get("type_line"),
            card.get("illustration_id"),
            card.get("artist"),
            card.get("rarity"),
            card.get("released_at"),
            bool(card.get("digital")),
            card.get("tcgplayer_id"),
            card.get("cardmarket_id"),
            prices.get("usd"),
            prices.get("eur"),
            json.dumps(purchase) if purchase else None,
            json.dumps(image_uris) if image_uris else None,
            None,  # local_image_normal
            None,  # local_image_art_crop
        ))

        # Card faces
        if card.get("card_faces"):
            for i, face in enumerate(card["card_faces"]):
                face_images = face.get("image_uris") or {}
                face_batch.append((
                    card["id"],
                    i,
                    face.get("name", ""),
                    face.get("mana_cost"),
                    face.get("type_line"),
                    face.get("oracle_text"),
                    json.dumps(face.get("colors") or []),
                    face.get("power"),
                    face.get("toughness"),
                    face.get("loyalty"),
                    face.get("defense"),
                    face.get("illustration_id"),
                    json.dumps(face_images) if face_images else None,
                ))

        count += 1
        if len(batch) >= 5000:
            _insert_printing_batch(cur, conn, batch)
            batch = []
            # Flush faces after printings so FK constraint is satisfied
            if face_batch:
                _insert_face_batch(cur, conn, face_batch)
                face_batch = []
            print(f"  {count} printings imported...")

    if batch:
        _insert_printing_batch(cur, conn, batch)
    if face_batch:
        _insert_face_batch(cur, conn, face_batch)

    cur.execute("SELECT COUNT(*) FROM printings")
    p_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM card_faces")
    f_count = cur.fetchone()[0]
    print(f"  Imported {p_count} printings, {f_count} card faces")
    if skipped:
        print(f"  Skipped {skipped} cards (no oracle_id)")


def _insert_printing_batch(cur, conn, batch):
    execute_values(
        cur,
        """INSERT INTO printings
           (scryfall_id, oracle_id, set_code, collector_number, name, flavor_name, layout,
            mana_cost, type_line, illustration_id, artist, rarity, released_at,
            digital, tcgplayer_id, cardmarket_id, price_usd, price_eur,
            purchase_uris, image_uris, local_image_normal, local_image_art_crop)
           VALUES %s
           ON CONFLICT (scryfall_id) DO UPDATE SET
             price_usd = EXCLUDED.price_usd, price_eur = EXCLUDED.price_eur,
             tcgplayer_id = EXCLUDED.tcgplayer_id, cardmarket_id = EXCLUDED.cardmarket_id,
             flavor_name = EXCLUDED.flavor_name""",
        batch,
    )
    conn.commit()


def _insert_face_batch(cur, conn, batch):
    execute_values(
        cur,
        """INSERT INTO card_faces
           (scryfall_id, face_index, name, mana_cost, type_line, oracle_text,
            colors, power, toughness, loyalty, defense, illustration_id, image_uris)
           VALUES %s
           ON CONFLICT (scryfall_id, face_index) DO NOTHING""",
        batch,
    )
    conn.commit()


def update_digital_only(cur, conn):
    """Mark cards as digital_only if all printings are in digital sets, or Alchemy/art_series."""
    print("Updating digital_only flags...")
    # Reset all to false first
    cur.execute("UPDATE oracle_cards SET digital_only = FALSE")
    # Cards where every printing is in a digital-only set
    cur.execute("""
        UPDATE oracle_cards o SET digital_only = TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM printings p
            JOIN sets s ON s.set_code = p.set_code
            WHERE p.oracle_id = o.oracle_id AND s.digital = FALSE
        )
    """)
    digital_count = cur.rowcount
    # Alchemy rebalanced cards (A- prefix)
    cur.execute("UPDATE oracle_cards SET digital_only = TRUE WHERE name LIKE 'A-%%' AND digital_only = FALSE")
    alchemy_count = cur.rowcount
    # Art series layout
    cur.execute("UPDATE oracle_cards SET digital_only = TRUE WHERE layout = 'art_series' AND digital_only = FALSE")
    art_count = cur.rowcount
    conn.commit()
    total = digital_count + alchemy_count + art_count
    print(f"  Marked {total} cards as digital_only ({digital_count} digital, {alchemy_count} Alchemy, {art_count} art_series)")


def print_stats(cur):
    print("\n=== Database Statistics ===")
    stats = [
        ("Sets", "SELECT COUNT(*) FROM sets"),
        ("Oracle Cards", "SELECT COUNT(*) FROM oracle_cards"),
        ("Printings", "SELECT COUNT(*) FROM printings"),
        ("Card Faces", "SELECT COUNT(*) FROM card_faces"),
        ("Unique Illustrations", "SELECT COUNT(DISTINCT illustration_id) FROM printings WHERE illustration_id IS NOT NULL"),
        ("With TCGPlayer ID", "SELECT COUNT(*) FROM printings WHERE tcgplayer_id IS NOT NULL"),
        ("With USD Price", "SELECT COUNT(*) FROM printings WHERE price_usd IS NOT NULL"),
    ]
    for label, query in stats:
        cur.execute(query)
        print(f"  {label}: {cur.fetchone()[0]:,}")


def main():
    start = time.time()

    if "SUPABASE_DB_URL" not in os.environ:
        print("ERROR: Set SUPABASE_DB_URL environment variable")
        print("  e.g., postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres")
        sys.exit(1)

    conn = psycopg2.connect(SUPABASE_DB_URL)
    cur = conn.cursor()

    # Load oracle cards for slug computation
    oracle_file = BULK_DIR / "oracle_cards.json"
    if oracle_file.exists():
        with open(oracle_file) as f:
            all_oracle = json.load(f)
        slugs = compute_slugs(all_oracle)
        print(f"Computed slugs for {len(slugs)} oracle cards")
    else:
        slugs = {}

    import_sets(cur, conn)
    import_oracle_cards(cur, conn, slugs)
    import_printings(cur, conn, slugs)
    update_digital_only(cur, conn)
    print_stats(cur)

    elapsed = time.time() - start
    print(f"\nTotal import time: {elapsed:.1f}s")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
