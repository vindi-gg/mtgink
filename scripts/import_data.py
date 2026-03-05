"""Import Scryfall bulk data into SQLite."""

import json
import sys
import time
from pathlib import Path

from models import DB_PATH, create_tables, get_connection

BULK_DIR = Path(__file__).parent.parent / "data" / "bulk"


def import_sets(conn):
    """Import sets from sets.json."""
    sets_file = BULK_DIR / "sets.json"
    if not sets_file.exists():
        print(f"ERROR: {sets_file} not found. Run download_bulk.py first.")
        sys.exit(1)

    with open(sets_file) as f:
        sets_data = json.load(f)

    print(f"Importing {len(sets_data)} sets...")

    for s in sets_data:
        conn.execute("""
            INSERT OR REPLACE INTO sets
            (set_code, set_id, name, set_type, released_at, card_count, printed_size,
             digital, foil_only, nonfoil_only, parent_set_code, block_code, block,
             icon_svg_uri, scryfall_uri, search_uri)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            s["code"],
            s["id"],
            s["name"],
            s.get("set_type"),
            s.get("released_at"),
            s.get("card_count"),
            s.get("printed_size"),
            1 if s.get("digital") else 0,
            1 if s.get("foil_only") else 0,
            1 if s.get("nonfoil_only") else 0,
            s.get("parent_set_code"),
            s.get("block_code"),
            s.get("block"),
            s.get("icon_svg_uri"),
            s.get("scryfall_uri"),
            s.get("search_uri"),
        ))

    conn.commit()
    count = conn.execute("SELECT COUNT(*) FROM sets").fetchone()[0]
    print(f"  Imported {count} sets")


def import_oracle_cards(conn):
    """Import oracle cards (one per logical card)."""
    oracle_file = BULK_DIR / "oracle_cards.json"
    if not oracle_file.exists():
        print(f"WARNING: {oracle_file} not found, will derive oracle cards from printings")
        return

    print(f"Loading oracle cards from {oracle_file}...")
    with open(oracle_file) as f:
        cards = json.load(f)

    print(f"Importing {len(cards)} oracle cards...")
    count = 0

    for card in cards:
        oracle_id = card.get("oracle_id")
        if not oracle_id:
            continue

        conn.execute("""
            INSERT OR REPLACE INTO oracle_cards
            (oracle_id, name, layout, mana_cost, cmc, type_line, oracle_text,
             colors, color_identity, keywords, power, toughness, loyalty, defense,
             legalities, reserved)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            oracle_id,
            card.get("name", ""),
            card.get("layout"),
            card.get("mana_cost"),
            card.get("cmc"),
            card.get("type_line"),
            card.get("oracle_text"),
            json.dumps(card.get("colors")) if card.get("colors") else None,
            json.dumps(card.get("color_identity")) if card.get("color_identity") else None,
            json.dumps(card.get("keywords")) if card.get("keywords") else None,
            card.get("power"),
            card.get("toughness"),
            card.get("loyalty"),
            card.get("defense"),
            json.dumps(card.get("legalities")) if card.get("legalities") else None,
            1 if card.get("reserved") else 0,
        ))
        count += 1

        if count % 5000 == 0:
            conn.commit()
            print(f"  {count} oracle cards imported...")

    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM oracle_cards").fetchone()[0]
    print(f"  Imported {total} oracle cards")


def extract_image_uris(card):
    """Extract image URIs from a card, handling multi-face cards."""
    image_uris = card.get("image_uris") or {}

    # For multi-face cards, image_uris might be on card_faces instead
    if not image_uris and card.get("card_faces"):
        # Use the first face's image for the main printing record
        first_face = card["card_faces"][0]
        image_uris = first_face.get("image_uris") or {}

    return image_uris


def import_printings(conn):
    """Import all printings from default_cards.json."""
    cards_file = BULK_DIR / "default_cards.json"
    if not cards_file.exists():
        print(f"ERROR: {cards_file} not found. Run download_bulk.py first.")
        sys.exit(1)

    print(f"Loading printings from {cards_file}...")
    with open(cards_file) as f:
        cards = json.load(f)

    print(f"Importing {len(cards)} printings...")

    # First pass: ensure all oracle_ids exist in oracle_cards
    oracle_seen = set()
    for card in cards:
        oracle_id = card.get("oracle_id")
        if oracle_id and oracle_id not in oracle_seen:
            oracle_seen.add(oracle_id)
            # Check if it exists
            exists = conn.execute(
                "SELECT 1 FROM oracle_cards WHERE oracle_id = ?", (oracle_id,)
            ).fetchone()
            if not exists:
                conn.execute("""
                    INSERT OR IGNORE INTO oracle_cards
                    (oracle_id, name, layout, mana_cost, cmc, type_line, oracle_text,
                     colors, color_identity, keywords, power, toughness, loyalty, defense,
                     legalities, reserved)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    oracle_id,
                    card.get("name", ""),
                    card.get("layout"),
                    card.get("mana_cost"),
                    card.get("cmc"),
                    card.get("type_line"),
                    card.get("oracle_text"),
                    json.dumps(card.get("colors")) if card.get("colors") else None,
                    json.dumps(card.get("color_identity")) if card.get("color_identity") else None,
                    json.dumps(card.get("keywords")) if card.get("keywords") else None,
                    card.get("power"),
                    card.get("toughness"),
                    card.get("loyalty"),
                    card.get("defense"),
                    json.dumps(card.get("legalities")) if card.get("legalities") else None,
                    1 if card.get("reserved") else 0,
                ))
    conn.commit()

    # Second pass: import all printings
    count = 0
    skipped = 0

    for card in cards:
        oracle_id = card.get("oracle_id")
        if not oracle_id:
            # Some special objects (tokens, emblems) may not have oracle_id
            # For reversible cards, oracle_id is on card_faces
            if card.get("card_faces"):
                oracle_id = card["card_faces"][0].get("oracle_id")
            if not oracle_id:
                skipped += 1
                continue

        image_uris = extract_image_uris(card)
        prices = card.get("prices") or {}
        purchase = card.get("purchase_uris") or {}

        conn.execute("""
            INSERT OR REPLACE INTO printings
            (scryfall_id, oracle_id, set_code, collector_number, name, lang,
             released_at, rarity, illustration_id, artist, artist_ids,
             border_color, frame, frame_effects, full_art, textless, booster,
             promo, promo_types, reprint, variation, variation_of, finishes,
             oversized, digital, flavor_text, watermark, image_status,
             image_uri_small, image_uri_normal, image_uri_large, image_uri_png,
             image_uri_art_crop, image_uri_border_crop,
             tcgplayer_id, tcgplayer_etched_id, cardmarket_id,
             mtgo_id, mtgo_foil_id, arena_id, multiverse_ids,
             price_usd, price_usd_foil, price_usd_etched,
             price_eur, price_eur_foil, price_tix,
             purchase_uri_tcgplayer, purchase_uri_cardmarket, purchase_uri_cardhoarder,
             scryfall_uri, prints_search_uri, rulings_uri)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            card["id"],
            oracle_id,
            card.get("set", ""),
            card.get("collector_number", ""),
            card.get("name", ""),
            card.get("lang", "en"),
            card.get("released_at"),
            card.get("rarity"),
            card.get("illustration_id"),
            card.get("artist"),
            json.dumps(card.get("artist_ids")) if card.get("artist_ids") else None,
            card.get("border_color"),
            card.get("frame"),
            json.dumps(card.get("frame_effects")) if card.get("frame_effects") else None,
            1 if card.get("full_art") else 0,
            1 if card.get("textless") else 0,
            1 if card.get("booster") else 0,
            1 if card.get("promo") else 0,
            json.dumps(card.get("promo_types")) if card.get("promo_types") else None,
            1 if card.get("reprint") else 0,
            1 if card.get("variation") else 0,
            card.get("variation_of"),
            json.dumps(card.get("finishes")) if card.get("finishes") else None,
            1 if card.get("oversized") else 0,
            1 if card.get("digital") else 0,
            card.get("flavor_text"),
            card.get("watermark"),
            card.get("image_status"),
            image_uris.get("small"),
            image_uris.get("normal"),
            image_uris.get("large"),
            image_uris.get("png"),
            image_uris.get("art_crop"),
            image_uris.get("border_crop"),
            card.get("tcgplayer_id"),
            card.get("tcgplayer_etched_id"),
            card.get("cardmarket_id"),
            card.get("mtgo_id"),
            card.get("mtgo_foil_id"),
            card.get("arena_id"),
            json.dumps(card.get("multiverse_ids")) if card.get("multiverse_ids") else None,
            prices.get("usd"),
            prices.get("usd_foil"),
            prices.get("usd_etched"),
            prices.get("eur"),
            prices.get("eur_foil"),
            prices.get("tix"),
            purchase.get("tcgplayer"),
            purchase.get("cardmarket"),
            purchase.get("cardhoarder"),
            card.get("scryfall_uri"),
            card.get("prints_search_uri"),
            card.get("rulings_uri"),
        ))

        # Import card faces for multi-face cards
        if card.get("card_faces"):
            for i, face in enumerate(card["card_faces"]):
                face_images = face.get("image_uris") or {}
                conn.execute("""
                    INSERT OR REPLACE INTO card_faces
                    (scryfall_id, face_index, name, mana_cost, type_line, oracle_text,
                     colors, color_indicator, power, toughness, loyalty, defense,
                     flavor_text, watermark, artist, artist_id, illustration_id,
                     image_uri_small, image_uri_normal, image_uri_large,
                     image_uri_png, image_uri_art_crop, image_uri_border_crop)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    card["id"],
                    i,
                    face.get("name", ""),
                    face.get("mana_cost"),
                    face.get("type_line"),
                    face.get("oracle_text"),
                    json.dumps(face.get("colors")) if face.get("colors") else None,
                    json.dumps(face.get("color_indicator")) if face.get("color_indicator") else None,
                    face.get("power"),
                    face.get("toughness"),
                    face.get("loyalty"),
                    face.get("defense"),
                    face.get("flavor_text"),
                    face.get("watermark"),
                    face.get("artist"),
                    face.get("artist_id"),
                    face.get("illustration_id"),
                    face_images.get("small"),
                    face_images.get("normal"),
                    face_images.get("large"),
                    face_images.get("png"),
                    face_images.get("art_crop"),
                    face_images.get("border_crop"),
                ))

        count += 1
        if count % 10000 == 0:
            conn.commit()
            print(f"  {count} printings imported...")

    conn.commit()
    total_printings = conn.execute("SELECT COUNT(*) FROM printings").fetchone()[0]
    total_faces = conn.execute("SELECT COUNT(*) FROM card_faces").fetchone()[0]
    print(f"  Imported {total_printings} printings, {total_faces} card faces")
    if skipped:
        print(f"  Skipped {skipped} cards (no oracle_id)")


def print_stats(conn):
    """Print database statistics."""
    print("\n=== Database Statistics ===")

    stats = [
        ("Sets", "SELECT COUNT(*) FROM sets"),
        ("Oracle Cards", "SELECT COUNT(*) FROM oracle_cards"),
        ("Printings", "SELECT COUNT(*) FROM printings"),
        ("Card Faces", "SELECT COUNT(*) FROM card_faces"),
        ("Unique Illustrations", "SELECT COUNT(DISTINCT illustration_id) FROM printings WHERE illustration_id IS NOT NULL"),
        ("Unique Artists", "SELECT COUNT(DISTINCT artist) FROM printings WHERE artist IS NOT NULL"),
        ("With TCGPlayer ID", "SELECT COUNT(*) FROM printings WHERE tcgplayer_id IS NOT NULL"),
        ("With USD Price", "SELECT COUNT(*) FROM printings WHERE price_usd IS NOT NULL"),
        ("Digital-only", "SELECT COUNT(*) FROM printings WHERE digital = 1"),
        ("Paper", "SELECT COUNT(*) FROM printings WHERE digital = 0"),
    ]

    for label, query in stats:
        count = conn.execute(query).fetchone()[0]
        print(f"  {label}: {count:,}")

    # Top sets by card count
    print("\n  Top 10 sets by printing count:")
    rows = conn.execute("""
        SELECT p.set_code, s.name, COUNT(*) as cnt
        FROM printings p
        JOIN sets s ON p.set_code = s.set_code
        GROUP BY p.set_code
        ORDER BY cnt DESC
        LIMIT 10
    """).fetchall()
    for row in rows:
        print(f"    {row['set_code']:>6} | {row['cnt']:>5} | {row['name']}")

    # Rarity distribution
    print("\n  Rarity distribution:")
    rows = conn.execute("""
        SELECT rarity, COUNT(*) as cnt
        FROM printings
        GROUP BY rarity
        ORDER BY cnt DESC
    """).fetchall()
    for row in rows:
        print(f"    {row['rarity'] or 'unknown':>12}: {row['cnt']:>6,}")

    db_size = DB_PATH.stat().st_size / 1024 / 1024
    print(f"\n  Database size: {db_size:.1f} MB")


def main():
    start = time.time()

    conn = get_connection()
    create_tables(conn)

    import_sets(conn)
    import_oracle_cards(conn)
    import_printings(conn)
    print_stats(conn)

    elapsed = time.time() - start
    print(f"\nTotal import time: {elapsed:.1f}s")

    conn.close()


if __name__ == "__main__":
    main()
