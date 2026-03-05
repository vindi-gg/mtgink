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

import requests

from models import get_connection

IMAGES_DIR = Path(__file__).parent.parent / "data" / "images"
HEADERS = {
    "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
}

# Track progress
stats = {"downloaded": 0, "skipped": 0, "failed": 0, "total": 0}


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
    # Sanitize collector number for filesystem (some have / or *)
    safe_num = collector_number.replace("/", "_").replace("*", "star")
    return IMAGES_DIR / set_code / f"{safe_num}_{image_type}.jpg"


def download_card_images(row, image_types):
    """Download requested image types for a single card."""
    results = []
    set_code = row["set_code"]
    collector_number = row["collector_number"]
    scryfall_id = row["scryfall_id"]

    for img_type in image_types:
        col = f"image_uri_{img_type}"
        url = row[col]
        if not url:
            continue

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
        help="Image types to download (default: normal art_crop)"
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
        "--paper-only", action="store_true", default=True,
        help="Only download paper cards (default: True)"
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Include digital-only cards"
    )
    args = parser.parse_args()

    conn = get_connection()

    # Build query
    conditions = []
    params = []

    if not args.all:
        conditions.append("digital = 0")

    if args.set_code:
        conditions.append("set_code = ?")
        params.append(args.set_code)

    # Only cards that have at least one image URL
    image_conditions = " OR ".join(f"image_uri_{t} IS NOT NULL" for t in args.types)
    conditions.append(f"({image_conditions})")

    where = " AND ".join(conditions) if conditions else "1=1"
    query = f"SELECT scryfall_id, set_code, collector_number, {', '.join(f'image_uri_{t}' for t in args.types)} FROM printings WHERE {where}"

    if args.limit:
        query += f" LIMIT {args.limit}"

    rows = conn.execute(query).fetchall()
    total = len(rows)
    print(f"Found {total:,} cards to process for image types: {', '.join(args.types)}")

    if total == 0:
        print("No cards to download.")
        return

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    skipped = 0
    failed = 0
    start_time = time.time()

    # Process with thread pool for parallel downloads
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

    # Update local_image paths in database
    if downloaded > 0:
        print("\nUpdating database with local image paths...")
        update_count = 0
        for row in rows:
            for img_type in args.types:
                dest = image_path(row["set_code"], row["collector_number"], img_type)
                if dest.exists():
                    col = f"local_image_{img_type}"
                    # Only update columns that exist
                    if img_type in ("normal", "art_crop"):
                        conn.execute(
                            f"UPDATE printings SET {col} = ? WHERE scryfall_id = ?",
                            (str(dest.relative_to(IMAGES_DIR.parent.parent)), row["scryfall_id"])
                        )
                        update_count += 1

        conn.commit()
        print(f"  Updated {update_count:,} image paths in database")

    conn.close()


if __name__ == "__main__":
    main()
