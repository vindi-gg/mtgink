#!/usr/bin/env python3
"""Refresh one or more specific MTG sets locally: pulls latest data from Scryfall
and upserts sets/oracle_cards/printings/card_faces. Optionally downloads images.

Unlike import_data_postgres.py, this hits Scryfall's public API per-set instead
of the ~700MB bulk JSON, so it's fast for spoiler-season updates.

Usage:
  python3 scripts/update_set.py soc sos soa              # data only
  python3 scripts/update_set.py --images soc sos soa     # data + images
  python3 scripts/update_set.py --images --force soc     # redownload existing images

Requires:
  - SUPABASE_DB_URL env var (or loaded from web/.env.development.local)
  - Local Supabase running (for local dev); for prod point at prod DB
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import psycopg2
import requests
from psycopg2.extras import execute_values


SCRYFALL_API = "https://api.scryfall.com"
HEADERS = {
    "User-Agent": "MTGInk/1.0 (set updater)",
    "Accept": "application/json",
}
# Scryfall asks for 50-100ms between requests
REQUEST_DELAY = 0.1


def slugify(name: str) -> str:
    """Match the TypeScript slugify — lowercase, strip quotes, hyphenate."""
    s = name.lower().replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def extract_image_version(image_uris: dict) -> Optional[str]:
    """Pull the Unix timestamp Scryfall appends to image URLs (?1728234567).
    This is what we use for cache-busting — bumps whenever Scryfall updates the image."""
    if not image_uris:
        return None
    for key in ("art_crop", "normal", "large", "png"):
        url = image_uris.get(key)
        if url:
            m = re.search(r"\?(\d+)$", url)
            if m:
                return m.group(1)
    return None


def get_db_url() -> str:
    """Read SUPABASE_DB_URL from env, falling back to .env.development.local."""
    if "SUPABASE_DB_URL" in os.environ:
        return os.environ["SUPABASE_DB_URL"]

    env_file = Path(__file__).parent.parent / "web" / ".env.development.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("SUPABASE_DB_URL="):
                return line.split("=", 1)[1].strip()

    print("ERROR: SUPABASE_DB_URL not set and not found in web/.env.development.local")
    sys.exit(1)


def fetch_set(set_code: str) -> dict:
    url = f"{SCRYFALL_API}/sets/{set_code}"
    r = requests.get(url, headers=HEADERS, timeout=30)
    if r.status_code == 404:
        raise ValueError(f"Set '{set_code}' not found on Scryfall")
    r.raise_for_status()
    time.sleep(REQUEST_DELAY)
    return r.json()


def fetch_cards(set_code: str) -> List[dict]:
    """Fetch all printings in a set (paginated, all variants)."""
    cards = []
    url = f"{SCRYFALL_API}/cards/search"
    params = {
        "q": f"set:{set_code}",
        "unique": "prints",
        "order": "set",
        "include_extras": "true",
        "include_variations": "true",
    }
    page = 1
    while url:
        r = requests.get(url, params=params if params else None, headers=HEADERS, timeout=60)
        if r.status_code == 404:
            return cards  # empty set
        r.raise_for_status()
        data = r.json()
        cards.extend(data.get("data", []))
        if data.get("has_more"):
            url = data["next_page"]
            params = None  # already in next_page URL
            page += 1
        else:
            url = None
        time.sleep(REQUEST_DELAY)
    return cards


def upsert_set(cur, conn, set_data: dict):
    cur.execute(
        """INSERT INTO sets (set_code, set_id, name, set_type, released_at, card_count,
                              printed_size, icon_svg_uri, parent_set_code, block_code, block, digital)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (set_code) DO UPDATE SET
             name = EXCLUDED.name, set_type = EXCLUDED.set_type,
             released_at = EXCLUDED.released_at, card_count = EXCLUDED.card_count,
             printed_size = EXCLUDED.printed_size,
             icon_svg_uri = EXCLUDED.icon_svg_uri, digital = EXCLUDED.digital""",
        (
            set_data["code"],
            set_data.get("id"),
            set_data["name"],
            set_data.get("set_type"),
            set_data.get("released_at"),
            set_data.get("card_count"),
            set_data.get("printed_size"),
            set_data.get("icon_svg_uri"),
            set_data.get("parent_set_code"),
            set_data.get("block_code"),
            set_data.get("block"),
            bool(set_data.get("digital")),
        ),
    )
    conn.commit()


def upsert_cards(cur, conn, cards: List[dict]) -> Set[str]:
    """Upsert oracle_cards, printings, card_faces for the given cards.

    Returns a set of scryfall_ids whose image_version changed (or are brand new).
    These are the cards that need their images redownloaded.
    """
    if not cards:
        return set()

    # Snapshot existing image_versions so we can tell which ones Scryfall updated
    scryfall_ids = [c["id"] for c in cards if c.get("id")]
    existing_versions: Dict[str, Optional[str]] = {}
    if scryfall_ids:
        cur.execute(
            "SELECT scryfall_id::text, image_version FROM printings WHERE scryfall_id = ANY(%s::uuid[])",
            (scryfall_ids,),
        )
        existing_versions = {row[0]: row[1] for row in cur.fetchall()}

    changed_image_ids: Set[str] = set()

    # Collect oracle_ids and upsert oracle_cards
    oracle_batch = []
    oracle_seen = set()
    for card in cards:
        oid = card.get("oracle_id")
        if not oid and card.get("card_faces"):
            oid = card["card_faces"][0].get("oracle_id")
        if not oid or oid in oracle_seen:
            continue
        oracle_seen.add(oid)
        oracle_batch.append((
            oid,
            card.get("name", ""),
            slugify(card.get("name", "")),
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

    if oracle_batch:
        execute_values(
            cur,
            """INSERT INTO oracle_cards
               (oracle_id, name, slug, layout, mana_cost, cmc, type_line, oracle_text,
                colors, color_identity, keywords, power, toughness, loyalty, defense,
                legalities, reserved)
               VALUES %s
               ON CONFLICT (oracle_id) DO UPDATE SET
                 name = EXCLUDED.name, layout = EXCLUDED.layout,
                 type_line = EXCLUDED.type_line, colors = EXCLUDED.colors,
                 mana_cost = EXCLUDED.mana_cost, cmc = EXCLUDED.cmc,
                 oracle_text = EXCLUDED.oracle_text""",
            oracle_batch,
        )
        conn.commit()

    # Upsert printings + collect card_faces
    printing_batch = []
    face_batch = []
    for card in cards:
        oracle_id = card.get("oracle_id")
        if not oracle_id and card.get("card_faces"):
            oracle_id = card["card_faces"][0].get("oracle_id")
        if not oracle_id:
            continue

        image_uris = card.get("image_uris") or {}
        if not image_uris and card.get("card_faces"):
            image_uris = card["card_faces"][0].get("image_uris") or {}

        prices = card.get("prices") or {}
        purchase = card.get("purchase_uris") or {}
        new_version = extract_image_version(image_uris)

        # Flag for image redownload if version changed or card is new
        old_version = existing_versions.get(card["id"])
        if new_version and new_version != old_version:
            changed_image_ids.add(card["id"])

        printing_batch.append((
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
            None,
            None,
            new_version,
        ))

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

    if printing_batch:
        execute_values(
            cur,
            """INSERT INTO printings
               (scryfall_id, oracle_id, set_code, collector_number, name, flavor_name, layout,
                mana_cost, type_line, illustration_id, artist, rarity, released_at,
                digital, tcgplayer_id, cardmarket_id, price_usd, price_eur,
                purchase_uris, image_uris, local_image_normal, local_image_art_crop,
                image_version)
               VALUES %s
               ON CONFLICT (scryfall_id) DO UPDATE SET
                 oracle_id = EXCLUDED.oracle_id,
                 set_code = EXCLUDED.set_code,
                 collector_number = EXCLUDED.collector_number,
                 name = EXCLUDED.name,
                 flavor_name = EXCLUDED.flavor_name,
                 layout = EXCLUDED.layout,
                 mana_cost = EXCLUDED.mana_cost,
                 type_line = EXCLUDED.type_line,
                 illustration_id = EXCLUDED.illustration_id,
                 artist = EXCLUDED.artist,
                 rarity = EXCLUDED.rarity,
                 released_at = EXCLUDED.released_at,
                 digital = EXCLUDED.digital,
                 tcgplayer_id = EXCLUDED.tcgplayer_id,
                 cardmarket_id = EXCLUDED.cardmarket_id,
                 price_usd = EXCLUDED.price_usd,
                 price_eur = EXCLUDED.price_eur,
                 purchase_uris = EXCLUDED.purchase_uris,
                 image_uris = EXCLUDED.image_uris,
                 image_version = EXCLUDED.image_version""",
            printing_batch,
        )
        conn.commit()

    if face_batch:
        execute_values(
            cur,
            """INSERT INTO card_faces
               (scryfall_id, face_index, name, mana_cost, type_line, oracle_text,
                colors, power, toughness, loyalty, defense, illustration_id, image_uris)
               VALUES %s
               ON CONFLICT (scryfall_id, face_index) DO UPDATE SET
                 name = EXCLUDED.name, mana_cost = EXCLUDED.mana_cost,
                 type_line = EXCLUDED.type_line, oracle_text = EXCLUDED.oracle_text,
                 illustration_id = EXCLUDED.illustration_id,
                 image_uris = EXCLUDED.image_uris""",
            face_batch,
        )
        conn.commit()

    return changed_image_ids


def refresh_has_image_for_set(cur, conn, set_code: str):
    """Mark printings in this set as has_image if they have image_uris."""
    cur.execute(
        """UPDATE printings SET has_image = TRUE
           WHERE set_code = %s AND image_uris IS NOT NULL""",
        (set_code,),
    )
    conn.commit()


def refresh_reprint_flags(cur, conn, set_code: str):
    """Recompute is_reprint + oracle_cards.original_set_code for cards in this set.
    Uses the SQL RPC from migration 071."""
    cur.execute("SELECT refresh_reprint_flags_for_set(%s)", (set_code,))
    conn.commit()


def download_set_images(set_code: str, force: bool):
    """Invoke download_images.py with --set filter (fills missing images)."""
    script = Path(__file__).parent / "download_images.py"
    cmd = ["python3", str(script), "--set", set_code]
    if force:
        cmd.append("--force")
    print(f"  Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=False)


def redownload_changed_images(changed_ids: Set[str], cur) -> Tuple[int, int]:
    """Force-redownload images for specific scryfall_ids (local filesystem or R2,
    controlled by USE_R2=1 env var — same convention as download_images.py).
    Used when Scryfall's image_version changed (e.g., preview → high-res update).
    Returns (downloaded, failed).

    Critical: must include the image_version as a query string on the Scryfall URL,
    otherwise Scryfall serves an older cached/preview variant even for highres cards.
    """
    if not changed_ids:
        return (0, 0)

    sys.path.insert(0, str(Path(__file__).parent))
    from download_images import (
        image_path,
        scryfall_image_url,
        HEADERS as DL_HEADERS,
        r2_key,
        upload_to_r2,
    )

    use_r2 = os.environ.get("USE_R2") == "1"

    cur.execute(
        """SELECT scryfall_id::text, set_code, collector_number, image_version
           FROM printings WHERE scryfall_id = ANY(%s::uuid[])""",
        (list(changed_ids),),
    )
    rows = cur.fetchall()

    downloaded = 0
    failed = 0
    for row in rows:
        scryfall_id, set_code, collector_number, image_version = row
        for img_type in ("normal", "art_crop"):
            url = scryfall_image_url(scryfall_id, img_type, image_version)
            try:
                resp = requests.get(url, headers=DL_HEADERS, timeout=30)
                resp.raise_for_status()
                if use_r2:
                    upload_to_r2(resp.content, r2_key(set_code, collector_number, img_type))
                else:
                    dest = image_path(set_code, collector_number, img_type)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with open(dest, "wb") as f:
                        f.write(resp.content)
                downloaded += 1
            except Exception as e:
                print(f"    FAILED: {scryfall_id} {img_type} -> {e}")
                failed += 1
    return (downloaded, failed)


def main():
    parser = argparse.ArgumentParser(description="Refresh specific MTG sets from Scryfall")
    parser.add_argument("sets", nargs="*", help="Set codes to update (e.g., soc sos soa). Omit with --recent to auto-select.")
    parser.add_argument("--images", action="store_true", help="Also download images for these sets")
    parser.add_argument("--force", action="store_true", help="Redownload existing images (only with --images)")
    parser.add_argument(
        "--recent",
        action="store_true",
        help="Auto-select non-digital sets released in a window around today (use --past-days / --future-days to tune).",
    )
    parser.add_argument("--past-days", type=int, default=180, help="Days in the past to include with --recent (default: 180)")
    parser.add_argument("--future-days", type=int, default=90, help="Days in the future to include with --recent (default: 90)")
    args = parser.parse_args()

    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    set_codes: List[str] = [s.lower() for s in args.sets]

    if args.recent:
        from datetime import datetime, timedelta
        today = datetime.utcnow().date()
        past = today - timedelta(days=args.past_days)
        future = today + timedelta(days=args.future_days)
        cur.execute(
            """SELECT set_code FROM sets
               WHERE digital = false
                 AND released_at IS NOT NULL
                 AND released_at BETWEEN %s AND %s
               ORDER BY released_at DESC""",
            (past.isoformat(), future.isoformat()),
        )
        recent_codes = [row[0] for row in cur.fetchall()]
        print(f"--recent: found {len(recent_codes)} sets between {past} and {future}")
        # Merge with any explicitly listed sets, dedupe preserving order
        seen = set(set_codes)
        for c in recent_codes:
            if c not in seen:
                set_codes.append(c)
                seen.add(c)

    if not set_codes:
        parser.error("No sets specified. Pass set codes or use --recent.")

    start = time.time()
    total_cards = 0
    total_changed = 0
    total_redownloaded = 0

    for raw_code in set_codes:
        set_code = raw_code.lower()
        print(f"\n=== {set_code} ===")

        try:
            set_data = fetch_set(set_code)
        except ValueError as e:
            print(f"  SKIP: {e}")
            continue

        print(f"  {set_data['name']} ({set_data.get('card_count', '?')} cards, released {set_data.get('released_at', '?')})")
        upsert_set(cur, conn, set_data)

        print(f"  Fetching cards from Scryfall...")
        cards = fetch_cards(set_code)
        print(f"  Got {len(cards)} printings")

        changed_ids = upsert_cards(cur, conn, cards)
        refresh_has_image_for_set(cur, conn, set_code)
        refresh_reprint_flags(cur, conn, set_code)
        total_cards += len(cards)
        total_changed += len(changed_ids)
        print(f"  {len(changed_ids)} printings have new/updated image_version")

        if args.images:
            # Step 1: fetch missing images (covers brand-new printings)
            print(f"  Downloading missing images...")
            download_set_images(set_code, force=args.force)

            # Step 2: force-redownload only the cards whose image_version changed
            #   (covers preview → high-res Scryfall updates)
            if changed_ids and not args.force:
                print(f"  Force-redownloading {len(changed_ids)} updated images...")
                dl, fail = redownload_changed_images(changed_ids, cur)
                print(f"    Redownloaded: {dl}, failed: {fail}")
                total_redownloaded += dl

    cur.close()
    conn.close()

    elapsed = time.time() - start
    print(f"\n=== Done ===")
    print(f"  Sets:           {len(set_codes)}")
    print(f"  Cards:          {total_cards}")
    print(f"  Image updates:  {total_changed} ({total_redownloaded} redownloaded)")
    print(f"  Elapsed:        {elapsed:.1f}s")


if __name__ == "__main__":
    main()
