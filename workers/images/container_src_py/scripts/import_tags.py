"""Download and import Scryfall Tagger data (art + oracle tags)."""

import json
import sys
import time
from pathlib import Path

import requests

from models import DB_PATH, create_tag_tables, get_connection

BULK_DIR = Path(__file__).parent.parent / "data" / "bulk"
HEADERS = {
    "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
    "Accept": "application/json",
}

TAG_ENDPOINTS = {
    "illustration": "https://api.scryfall.com/private/tags/illustration",
    "oracle": "https://api.scryfall.com/private/tags/oracle",
}


def download_tags():
    """Download tag JSON files from Scryfall."""
    BULK_DIR.mkdir(parents=True, exist_ok=True)

    for tag_type, url in TAG_ENDPOINTS.items():
        dest = BULK_DIR / f"tags_{tag_type}.json"
        print(f"Downloading {tag_type} tags...")

        resp = requests.get(url, headers=HEADERS, stream=True)
        resp.raise_for_status()

        total = int(resp.headers.get("content-length", 0))
        downloaded = 0

        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded / total * 100
                    mb = downloaded / 1024 / 1024
                    mb_total = total / 1024 / 1024
                    print(f"\r  {mb:.1f}/{mb_total:.1f} MB ({pct:.1f}%)", end="", flush=True)

        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"\n  Saved to {dest} ({size_mb:.1f} MB)")


def import_tags(conn):
    """Import tags from downloaded JSON files."""
    create_tag_tables(conn)

    total_tags = 0
    total_illustration_assoc = 0
    total_oracle_assoc = 0

    # Import illustration tags
    ill_file = BULK_DIR / "tags_illustration.json"
    if not ill_file.exists():
        print(f"ERROR: {ill_file} not found. Download failed?")
        sys.exit(1)

    print(f"Loading illustration tags from {ill_file}...")
    with open(ill_file) as f:
        ill_raw = json.load(f)
    ill_tags = ill_raw["data"] if isinstance(ill_raw, dict) else ill_raw

    print(f"Importing {len(ill_tags)} illustration tags...")
    tag_rows = []
    assoc_rows = []

    for tag in ill_tags:
        tag_id = tag["id"]
        tag_rows.append((tag_id, tag["label"], "illustration", tag.get("description")))
        for ill_id in tag.get("illustration_ids", []):
            assoc_rows.append((ill_id, tag_id))

    conn.executemany(
        "INSERT INTO tags (tag_id, label, type, description) VALUES (?, ?, ?, ?)",
        tag_rows,
    )
    conn.executemany(
        "INSERT INTO illustration_tags (illustration_id, tag_id) VALUES (?, ?)",
        assoc_rows,
    )
    conn.commit()

    total_tags += len(tag_rows)
    total_illustration_assoc = len(assoc_rows)
    print(f"  {len(tag_rows)} tags, {len(assoc_rows):,} associations")

    # Import oracle tags
    ora_file = BULK_DIR / "tags_oracle.json"
    if not ora_file.exists():
        print(f"ERROR: {ora_file} not found. Download failed?")
        sys.exit(1)

    print(f"Loading oracle tags from {ora_file}...")
    with open(ora_file) as f:
        ora_raw = json.load(f)
    ora_tags = ora_raw["data"] if isinstance(ora_raw, dict) else ora_raw

    print(f"Importing {len(ora_tags)} oracle tags...")
    tag_rows = []
    assoc_rows = []

    for tag in ora_tags:
        tag_id = tag["id"]
        tag_rows.append((tag_id, tag["label"], "oracle", tag.get("description")))
        for oracle_id in tag.get("oracle_ids", []):
            assoc_rows.append((oracle_id, tag_id))

    conn.executemany(
        "INSERT INTO tags (tag_id, label, type, description) VALUES (?, ?, ?, ?)",
        tag_rows,
    )
    conn.executemany(
        "INSERT INTO oracle_tags (oracle_id, tag_id) VALUES (?, ?)",
        assoc_rows,
    )
    conn.commit()

    total_tags += len(tag_rows)
    total_oracle_assoc = len(assoc_rows)
    print(f"  {len(tag_rows)} tags, {len(assoc_rows):,} associations")

    # Print summary
    print(f"\n=== Tag Import Summary ===")
    print(f"  Total tags: {total_tags:,}")
    print(f"  Illustration associations: {total_illustration_assoc:,}")
    print(f"  Oracle associations: {total_oracle_assoc:,}")

    # Spot check
    row = conn.execute("""
        SELECT t.label
        FROM illustration_tags it
        JOIN tags t ON it.tag_id = t.tag_id
        WHERE it.illustration_id = (
            SELECT illustration_id FROM printings WHERE name = 'Lightning Bolt' LIMIT 1
        )
        ORDER BY t.label
        LIMIT 10
    """).fetchall()
    if row:
        labels = [r[0] for r in row]
        print(f"\n  Lightning Bolt art tags (sample): {', '.join(labels)}")

    db_size = DB_PATH.stat().st_size / 1024 / 1024
    print(f"  Database size: {db_size:.1f} MB")


def main():
    start = time.time()

    download_tags()

    conn = get_connection()
    import_tags(conn)
    conn.close()

    elapsed = time.time() - start
    print(f"\nTotal time: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
