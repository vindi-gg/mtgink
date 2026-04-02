"""Download card images from Scryfall CDN.

Scryfall CDN (*.scryfall.io) is exempt from API rate limits,
but we still add a small delay to be respectful.
"""

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

IMAGES_DIR = Path(__file__).parent.parent / "data" / "images"
HEADERS = {
    "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
}


def download_image(url: str, dest: Path) -> bool:
    """Download a single image. Returns True if downloaded, False if skipped/failed."""
    if dest.exists() and dest.stat().st_size > 0:
        return False  # Already exists

    dest.parent.mkdir(parents=True, exist_ok=True)

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        with open(dest, "wb") as f:
            f.write(resp.content)
        return True
    except Exception as e:
        print(f"\n  FAILED: {url} -> {e}")
        return None  # Error


def image_path(set_code: str, collector_number: str, image_type: str) -> Path:
    """Build local path for a card image."""
    safe_num = collector_number.replace("/", "_").replace("*", "star")
    return IMAGES_DIR / set_code / f"{safe_num}_{image_type}.jpg"


def scryfall_image_url(scryfall_id: str, image_type: str) -> str:
    """Build Scryfall CDN URL from scryfall_id."""
    # Scryfall CDN uses first two chars of UUID as directory
    d1, d2 = scryfall_id[0], scryfall_id[1]
    return f"https://cards.scryfall.io/{image_type}/front/{d1}/{d2}/{scryfall_id}.jpg"


def download_card_images(row, image_types):
    """Download requested image types for a single card."""
    results = []
    set_code = row["set_code"]
    collector_number = row["collector_number"]
    scryfall_id = row["scryfall_id"]

    for img_type in image_types:
        url = scryfall_image_url(scryfall_id, img_type)
        dest = image_path(set_code, collector_number, img_type)
        result = download_image(url, dest)

        if result is True:
            results.append(("downloaded", scryfall_id, img_type, str(dest)))
        elif result is False:
            results.append(("skipped", scryfall_id, img_type, str(dest)))
        else:
            results.append(("failed", scryfall_id, img_type, None))

    return results


def main():
    parser = argparse.ArgumentParser(description="Download MTG card images from Scryfall")
    parser.add_argument(
        "--types", nargs="+", default=["normal", "art_crop"],
        choices=["small", "normal", "large", "png", "art_crop", "border_crop"],
        help="Image types to download (default: art_crop)"
    )
    parser.add_argument(
        "--set", dest="set_code", help="Only download images for a specific set"
    )
    parser.add_argument(
        "--limit", type=int, help="Limit number of cards to download"
    )
    parser.add_argument(
        "--workers", type=int, default=4,
        help="Number of parallel download workers (default: 4)"
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Include digital-only cards"
    )
    args = parser.parse_args()

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        # Try loading from .env.development.local
        env_file = Path(__file__).parent.parent / "web" / ".env.development.local"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("SUPABASE_DB_URL="):
                    db_url = line.split("=", 1)[1]
                    break
    if not db_url:
        env_file = Path(__file__).parent.parent / "web" / ".env.local"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("SUPABASE_DB_URL="):
                    db_url = line.split("=", 1)[1]
                    break
    if not db_url:
        print("ERROR: Set SUPABASE_DB_URL environment variable")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Build query
    conditions = ["p.illustration_id IS NOT NULL"]
    params = []

    if not args.all:
        conditions.append("s.digital = FALSE")

    if args.set_code:
        conditions.append("p.set_code = %s")
        params.append(args.set_code)

    where = " AND ".join(conditions)
    query = f"""
        SELECT p.scryfall_id, p.set_code, p.collector_number
        FROM printings p
        JOIN sets s ON s.set_code = p.set_code
        WHERE {where}
        ORDER BY p.set_code, p.collector_number
    """

    if args.limit:
        query += f" LIMIT {args.limit}"

    cur.execute(query, params)
    rows = cur.fetchall()
    total = len(rows)
    print(f"Found {total:,} cards to process for image types: {', '.join(args.types)}")

    if total == 0:
        print("No cards to download.")
        cur.close()
        conn.close()
        return

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    skipped = 0
    failed = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {}
        for row in rows:
            future = executor.submit(download_card_images, row, args.types)
            futures[future] = row["scryfall_id"]

        processed = 0
        for future in as_completed(futures):
            processed += 1
            results = future.result()

            for status, scryfall_id, img_type, dest_path in results:
                if status == "downloaded":
                    downloaded += 1
                elif status == "skipped":
                    skipped += 1
                else:
                    failed += 1

            if processed % 500 == 0:
                elapsed = time.time() - start_time
                rate = downloaded / elapsed if elapsed > 0 else 0
                print(f"  Progress: {processed:,}/{total:,} cards | "
                      f"Downloaded: {downloaded:,} | Skipped: {skipped:,} | "
                      f"Failed: {failed:,} | Rate: {rate:.1f} img/s")

    elapsed = time.time() - start_time
    print(f"\n=== Image Download Complete ===")
    print(f"  Downloaded: {downloaded:,}")
    print(f"  Skipped (already existed): {skipped:,}")
    print(f"  Failed: {failed:,}")
    print(f"  Time: {elapsed:.1f}s ({elapsed/60:.1f} min)")

    # Update has_image flag for successfully downloaded cards
    if downloaded > 0:
        print("\nUpdating has_image flags...")
        update_ids = []
        for row in rows:
            for img_type in args.types:
                dest = image_path(row["set_code"], row["collector_number"], img_type)
                if dest.exists():
                    update_ids.append(row["scryfall_id"])
                    break

        if update_ids:
            cur.execute(
                "UPDATE printings SET has_image = TRUE WHERE scryfall_id = ANY(%s::uuid[])",
                (update_ids,)
            )
            conn.commit()
            print(f"  Updated {len(update_ids):,} has_image flags")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
