"""Import EDHREC commander data into SQLite.

Downloads commander lists and detail pages from EDHREC's JSON endpoints,
caches responses locally, and imports into mtgink.db.

Usage:
    python3 scripts/import_edhrec.py          # Full import (resume-safe)
    python3 scripts/import_edhrec.py --stats   # Just print stats from existing data
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests

from models import DB_PATH, create_edhrec_tables, get_connection

BASE_URL = "https://json.edhrec.com/pages"
CACHE_DIR = Path(__file__).parent.parent / "data" / "edhrec_cache"
LISTS_CACHE = CACHE_DIR / "lists"
COMMANDERS_CACHE = CACHE_DIR / "commanders"

HEADERS = {
    "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
    "Accept": "application/json",
}

REQUEST_DELAY = 0.3  # seconds between requests

# All 32 color identity slugs on EDHREC
COLOR_SLUGS = [
    "colorless",
    "mono-white", "mono-blue", "mono-black", "mono-red", "mono-green",
    "azorius", "dimir", "rakdos", "gruul", "selesnya",
    "orzhov", "izzet", "golgari", "boros", "simic",
    "esper", "grixis", "jund", "naya", "bant",
    "abzan", "jeskai", "sultai", "mardu", "temur",
    "yore-tiller", "glint-eye", "dune-brood", "ink-treader", "witch-maw",
    "five-color",
]


def fetch_json(url: str, cache_path: Path) -> dict | None:
    """Fetch JSON from URL with file-based caching."""
    if cache_path.exists():
        try:
            with open(cache_path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass  # Re-fetch on corrupt cache

    time.sleep(REQUEST_DELAY)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_path, "w") as f:
            json.dump(data, f)
        return data
    except requests.RequestException as e:
        print(f"  WARNING: Failed to fetch {url}: {e}")
        return None


def extract_cardviews(data: dict, is_first_page: bool) -> list[dict]:
    """Extract card entries from a commander list page.

    Page 1: container.json_dict.cardlists[0].cardviews
    Page 2+: top-level cardviews
    """
    if not is_first_page:
        views = data.get("cardviews")
        if views:
            return views

    try:
        return data["container"]["json_dict"]["cardlists"][0]["cardviews"]
    except (KeyError, IndexError, TypeError):
        # Try top-level as fallback
        return data.get("cardviews", [])


def extract_pagination(data: dict, is_first_page: bool) -> str | None:
    """Extract the 'more' pagination URL from a list page."""
    if not is_first_page:
        return data.get("more")

    try:
        return data["container"]["json_dict"]["cardlists"][0].get("more")
    except (KeyError, IndexError, TypeError):
        return data.get("more")


# =============================================================================
# Phase 1: Enumerate commanders from color identity pages
# =============================================================================

def enumerate_commanders() -> dict[str, dict]:
    """Fetch all commander lists by color identity, return deduped dict keyed by sanitized slug."""
    LISTS_CACHE.mkdir(parents=True, exist_ok=True)
    commanders = {}  # sanitized -> commander dict
    total_fetched = 0

    for slug in COLOR_SLUGS:
        page_num = 0
        page_url = f"{BASE_URL}/commanders/{slug}.json"
        cache_file = LISTS_CACHE / f"{slug}.json"

        while page_url:
            data = fetch_json(page_url, cache_file)
            if data is None:
                if page_num == 0:
                    print(f"  WARNING: No data for {slug}, skipping")
                break

            is_first = (page_num == 0)
            cardviews = extract_cardviews(data, is_first)
            more = extract_pagination(data, is_first)

            for card in cardviews:
                sanitized = card.get("sanitized")
                if not sanitized:
                    continue
                if sanitized not in commanders:
                    commanders[sanitized] = {
                        "id": card.get("id"),
                        "name": card.get("name", ""),
                        "sanitized": sanitized,
                        "num_decks": card.get("num_decks", 0),
                        "color_slug": slug,
                    }

            total_fetched += len(cardviews)

            if more:
                page_num += 1
                page_url = f"{BASE_URL}/{more}"
                cache_file = LISTS_CACHE / f"{slug}_page{page_num}.json"
            else:
                page_url = None

        print(f"  {slug}: {total_fetched} total entries so far, {len(commanders)} unique commanders")

    return commanders


# =============================================================================
# Phase 2: Fetch commander detail pages
# =============================================================================

def fetch_commander_details(commanders: dict[str, dict]):
    """Fetch detail page for each commander. Updates commanders dict in place."""
    COMMANDERS_CACHE.mkdir(parents=True, exist_ok=True)
    total = len(commanders)
    fetched = 0
    cached = 0

    for i, (sanitized, cmd) in enumerate(commanders.items()):
        cache_file = COMMANDERS_CACHE / f"{sanitized}.json"

        if cache_file.exists():
            cached += 1
        else:
            fetched += 1

        data = fetch_json(
            f"{BASE_URL}/commanders/{sanitized}.json",
            cache_file,
        )

        if data:
            # Extract metadata from detail page root
            cmd["num_decks_detail"] = data.get("num_decks_avg", cmd.get("num_decks", 0))
            cmd["deck_size"] = data.get("deck_size")

            # Try to get commander card data from container.json_dict.card
            card_data = None
            try:
                card_data = data["container"]["json_dict"].get("card")
            except (KeyError, TypeError):
                pass
            if card_data:
                cmd["salt"] = card_data.get("salt")
                cmd["rank"] = card_data.get("rank")
                cmd["color_identity"] = card_data.get("color_identity")
                if card_data.get("id"):
                    cmd["id"] = card_data["id"]

            cmd["_detail"] = data
        else:
            cmd["_detail"] = None

        if (i + 1) % 100 == 0:
            print(f"  Progress: {i + 1}/{total} ({cached} cached, {fetched} fetched)")

    print(f"  Done: {total} commanders ({cached} cached, {fetched} newly fetched)")


# =============================================================================
# Phase 3: Import into SQLite
# =============================================================================

def build_scryfall_lookup(conn) -> dict[str, str]:
    """Build scryfall_id -> oracle_id lookup from printings table."""
    print("  Building scryfall_id -> oracle_id lookup...")
    rows = conn.execute("SELECT scryfall_id, oracle_id FROM printings").fetchall()
    lookup = {row[0]: row[1] for row in rows}
    print(f"  Loaded {len(lookup):,} printings")
    return lookup


def import_commanders(conn, commanders: dict[str, dict], lookup: dict[str, str]) -> dict[str, str]:
    """Import commanders into edhrec_commanders table. Returns sanitized -> oracle_id mapping."""
    sanitized_to_oracle = {}
    imported = 0
    skipped_no_oracle = 0

    for sanitized, cmd in commanders.items():
        scryfall_id = cmd.get("id", "")
        oracle_id = lookup.get(scryfall_id)

        if not oracle_id:
            skipped_no_oracle += 1
            continue

        sanitized_to_oracle[sanitized] = oracle_id
        num_decks = cmd.get("num_decks_detail", cmd.get("num_decks", 0))

        color_identity = cmd.get("color_identity")
        if isinstance(color_identity, list):
            color_identity = json.dumps(color_identity)

        conn.execute("""
            INSERT OR REPLACE INTO edhrec_commanders
            (oracle_id, scryfall_id, name, sanitized, color_identity,
             num_decks, rank, deck_size, salt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            oracle_id,
            scryfall_id,
            cmd.get("name", ""),
            sanitized,
            color_identity,
            num_decks,
            cmd.get("rank"),
            cmd.get("deck_size"),
            cmd.get("salt"),
        ))
        imported += 1

        if imported % 500 == 0:
            conn.commit()

    conn.commit()
    print(f"  Imported {imported:,} commanders ({skipped_no_oracle} skipped — not in our DB)")
    return sanitized_to_oracle


def import_recommendations(conn, commanders: dict[str, dict],
                           sanitized_to_oracle: dict[str, str],
                           lookup: dict[str, str]):
    """Import card recommendations from commander detail pages."""
    total_recs = 0
    matched = 0

    for sanitized, oracle_id in sanitized_to_oracle.items():
        cmd = commanders[sanitized]
        detail = cmd.get("_detail")
        if not detail:
            continue

        # Extract cardlists from detail page
        try:
            cardlists = detail["container"]["json_dict"]["cardlists"]
        except (KeyError, TypeError):
            continue

        for cardlist in cardlists:
            category = cardlist.get("header", cardlist.get("tag", "Unknown"))
            cards = cardlist.get("cardviews", [])

            for card in cards:
                card_scryfall_id = card.get("id", "")
                card_oracle_id = lookup.get(card_scryfall_id)
                inclusion = card.get("inclusion", card.get("num_decks", 0))

                conn.execute("""
                    INSERT OR IGNORE INTO edhrec_recommendations
                    (commander_oracle_id, card_oracle_id, scryfall_id,
                     card_name, category, synergy, inclusion, potential_decks)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    oracle_id,
                    card_oracle_id,
                    card_scryfall_id,
                    card.get("name", ""),
                    category,
                    card.get("synergy"),
                    inclusion,
                    card.get("potential_decks"),
                ))
                total_recs += 1
                if card_oracle_id:
                    matched += 1

        if total_recs % 50000 == 0 and total_recs > 0:
            conn.commit()

    conn.commit()
    match_pct = (matched / total_recs * 100) if total_recs else 0
    print(f"  Imported {total_recs:,} recommendations ({matched:,} matched to our DB, {match_pct:.1f}%)")


def import_to_sqlite(commanders: dict[str, dict]):
    """Phase 3: Create tables and import all data."""
    conn = get_connection()
    create_edhrec_tables(conn)

    lookup = build_scryfall_lookup(conn)
    sanitized_to_oracle = import_commanders(conn, commanders, lookup)
    import_recommendations(conn, commanders, sanitized_to_oracle, lookup)

    conn.close()
    return sanitized_to_oracle


# =============================================================================
# Phase 4: Build popularity aggregates
# =============================================================================

def build_popularity_aggregates():
    """Aggregate recommendation data into edhrec_card_popularity."""
    conn = get_connection()

    conn.execute("DELETE FROM edhrec_card_popularity")
    conn.execute("""
        INSERT INTO edhrec_card_popularity
            (oracle_id, total_inclusions, commander_count, avg_synergy, max_synergy, avg_inclusion_pct)
        SELECT
            card_oracle_id,
            SUM(inclusion),
            COUNT(DISTINCT commander_oracle_id),
            AVG(synergy),
            MAX(synergy),
            AVG(CAST(inclusion AS REAL) / NULLIF(potential_decks, 0) * 100)
        FROM edhrec_recommendations
        WHERE card_oracle_id IS NOT NULL
        GROUP BY card_oracle_id
    """)
    conn.commit()

    count = conn.execute("SELECT COUNT(*) FROM edhrec_card_popularity").fetchone()[0]
    print(f"  Built popularity aggregates for {count:,} cards")
    conn.close()


# =============================================================================
# Phase 5: Print stats
# =============================================================================

def print_stats():
    """Print summary statistics."""
    conn = get_connection()

    commanders = conn.execute("SELECT COUNT(*) FROM edhrec_commanders").fetchone()[0]
    recs = conn.execute("SELECT COUNT(*) FROM edhrec_recommendations").fetchone()[0]
    matched_recs = conn.execute(
        "SELECT COUNT(*) FROM edhrec_recommendations WHERE card_oracle_id IS NOT NULL"
    ).fetchone()[0]
    pop_cards = conn.execute("SELECT COUNT(*) FROM edhrec_card_popularity").fetchone()[0]

    print(f"\n{'='*50}")
    print(f"  EDHREC Import Summary")
    print(f"{'='*50}")
    print(f"  Commanders:        {commanders:,}")
    print(f"  Recommendations:   {recs:,}")
    print(f"  Matched to our DB: {matched_recs:,} ({matched_recs/recs*100:.1f}%)" if recs else "")
    print(f"  Unique EDH cards:  {pop_cards:,}")

    print(f"\n  Top 10 commanders by deck count:")
    rows = conn.execute("""
        SELECT ec.name, ec.num_decks, ec.color_identity
        FROM edhrec_commanders ec
        ORDER BY ec.num_decks DESC
        LIMIT 10
    """).fetchall()
    for row in rows:
        colors = row["color_identity"] or "?"
        print(f"    {row['num_decks']:>8,} decks | {colors:>16} | {row['name']}")

    print(f"\n  Top 10 most popular EDH cards:")
    rows = conn.execute("""
        SELECT oc.name, ep.commander_count, ep.total_inclusions, ep.avg_synergy
        FROM edhrec_card_popularity ep
        JOIN oracle_cards oc ON ep.oracle_id = oc.oracle_id
        ORDER BY ep.commander_count DESC
        LIMIT 10
    """).fetchall()
    for row in rows:
        syn = f"{row['avg_synergy']:+.2f}" if row["avg_synergy"] is not None else "  n/a"
        print(f"    {row['commander_count']:>6,} commanders | {row['total_inclusions']:>10,} inclusions | syn {syn} | {row['name']}")

    db_size = DB_PATH.stat().st_size / 1024 / 1024
    print(f"\n  Database size: {db_size:.1f} MB")

    conn.close()


# =============================================================================
# Main
# =============================================================================

def main():
    if "--stats" in sys.argv:
        print_stats()
        return

    start = time.time()

    print("Phase 1: Enumerating commanders from EDHREC...")
    commanders = enumerate_commanders()
    print(f"  Found {len(commanders):,} unique commanders\n")

    print("Phase 2: Fetching commander detail pages...")
    fetch_commander_details(commanders)
    print()

    print("Phase 3: Importing into SQLite...")
    import_to_sqlite(commanders)
    print()

    print("Phase 4: Building popularity aggregates...")
    build_popularity_aggregates()
    print()

    print("Phase 5: Stats")
    print_stats()

    elapsed = time.time() - start
    print(f"\nTotal time: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
