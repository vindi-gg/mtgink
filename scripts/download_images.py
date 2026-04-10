"""Download card images from Scryfall CDN.

Supports two output modes:
  - filesystem (local dev): writes to data/images/
  - r2 (prod): uploads to Cloudflare R2 via S3-compatible API
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

# R2 via S3-compatible API (boto3)
_s3_client = None


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.config import Config
        _s3_client = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_ENDPOINT"],
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
            config=Config(s3={"addressing_style": "path"}),
        )
    return _s3_client


def r2_key(set_code: str, collector_number: str, image_type: str) -> str:
    safe_num = collector_number.replace("/", "_").replace("*", "star")
    return f"{set_code}/{safe_num}_{image_type}.jpg"


def r2_exists(key: str) -> bool:
    try:
        get_s3_client().head_object(Bucket=os.environ.get("R2_BUCKET", "mtgink-cdn"), Key=key)
        return True
    except Exception:
        return False


_upload_count = 0

def upload_to_r2(data: bytes, key: str):
    global _upload_count
    bucket = os.environ.get("R2_BUCKET", "mtgink-cdn")
    resp = get_s3_client().put_object(Bucket=bucket, Key=key, Body=data, ContentType="image/jpeg")
    _upload_count += 1
    status = resp["ResponseMetadata"]["HTTPStatusCode"]
    if _upload_count <= 5 or _upload_count % 100 == 0:
        print(f"  R2 PUT [{_upload_count}] {key} ({len(data)}b) → HTTP {status}", flush=True)
    if status != 200:
        raise RuntimeError(f"R2 PUT failed: {key} HTTP {status}")


def image_path(set_code: str, collector_number: str, image_type: str) -> Path:
    safe_num = collector_number.replace("/", "_").replace("*", "star")
    return IMAGES_DIR / set_code / f"{safe_num}_{image_type}.jpg"


def scryfall_image_url(scryfall_id: str, image_type: str, image_version: str = None) -> str:
    d1, d2 = scryfall_id[0], scryfall_id[1]
    base = f"https://cards.scryfall.io/{image_type}/front/{d1}/{d2}/{scryfall_id}.jpg"
    # Scryfall serves a different (newer) file when the version query string is
    # included. Without it they often serve an older cached/preview variant.
    if image_version:
        return f"{base}?{image_version}"
    return base


def download_card_images(row, image_types, use_r2, force=False):
    results = []
    set_code = row["set_code"]
    collector_number = row["collector_number"]
    scryfall_id = row["scryfall_id"]
    image_version = row.get("image_version")

    for img_type in image_types:
        url = scryfall_image_url(scryfall_id, img_type, image_version)

        if use_r2:
            key = r2_key(set_code, collector_number, img_type)
            if not force and r2_exists(key):
                results.append(("skipped", scryfall_id, img_type, key))
                continue
            try:
                resp = requests.get(url, headers=HEADERS, timeout=30)
                resp.raise_for_status()
                upload_to_r2(resp.content, key)
                results.append(("downloaded", scryfall_id, img_type, key))
            except Exception as e:
                print(f"\n  FAILED: {url} -> {e}")
                results.append(("failed", scryfall_id, img_type, None))
        else:
            dest = image_path(set_code, collector_number, img_type)
            if not force and dest.exists() and dest.stat().st_size > 0:
                results.append(("skipped", scryfall_id, img_type, str(dest)))
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                resp = requests.get(url, headers=HEADERS, timeout=30)
                resp.raise_for_status()
                with open(dest, "wb") as f:
                    f.write(resp.content)
                results.append(("downloaded", scryfall_id, img_type, str(dest)))
            except Exception as e:
                print(f"\n  FAILED: {url} -> {e}")
                results.append(("failed", scryfall_id, img_type, None))

    return results


def main():
    parser = argparse.ArgumentParser(description="Download MTG card images from Scryfall")
    parser.add_argument(
        "--types", nargs="+", default=["normal", "art_crop"],
        choices=["small", "normal", "large", "png", "art_crop", "border_crop"],
        help="Image types to download (default: normal art_crop)"
    )
    parser.add_argument("--set", dest="set_code", help="Only download images for a specific set")
    parser.add_argument("--limit", type=int, help="Limit number of cards to download")
    parser.add_argument("--workers", type=int, default=4, help="Number of parallel download workers")
    parser.add_argument("--all", action="store_true", help="Include digital-only cards")
    parser.add_argument("--force", action="store_true", help="Re-check all cards, not just has_image=FALSE")
    args = parser.parse_args()

    use_r2 = os.environ.get("USE_R2") == "1"
    if use_r2:
        bucket = os.environ.get("R2_BUCKET", "mtgink-cdn")
        print(f"Output: R2 (bucket={bucket})")
        try:
            upload_to_r2(b"r2_test", "_r2_test.txt")
            print("  R2 connectivity: OK")
        except Exception as e:
            print(f"  R2 connectivity FAILED: {e}")
            use_r2 = False
    else:
        print(f"Output: filesystem ({IMAGES_DIR})")

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        for env_file in ["web/.env.development.local", "web/.env.local"]:
            p = Path(__file__).parent.parent / env_file
            if p.exists():
                for line in p.read_text().splitlines():
                    if line.startswith("SUPABASE_DB_URL="):
                        db_url = line.split("=", 1)[1]
                        break
            if db_url:
                break
    if not db_url:
        print("ERROR: Set SUPABASE_DB_URL environment variable")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    conditions = ["p.scryfall_id IS NOT NULL"]
    params = []

    if not args.all:
        conditions.append("s.digital = FALSE")

    # Smart diff: only process cards without images (unless force or specific set)
    if not args.force and not args.set_code:
        conditions.append("p.has_image = FALSE")

    if args.set_code:
        conditions.append("p.set_code = %s")
        params.append(args.set_code)

    where = " AND ".join(conditions)
    query = f"""
        SELECT p.scryfall_id, p.set_code, p.collector_number, p.image_version
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

    if not use_r2:
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    skipped = 0
    failed = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {}
        for row in rows:
            future = executor.submit(download_card_images, row, args.types, use_r2, args.force)
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

    # Update has_image flags
    if downloaded > 0:
        print("\nUpdating has_image flags...")
        update_ids = []
        for row in rows:
            update_ids.append(row["scryfall_id"])

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
