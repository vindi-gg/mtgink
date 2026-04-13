"""Download and import Scryfall Tagger data into Supabase Postgres."""

import json
import os
import sys
import time
from pathlib import Path

import re

import psycopg2
from psycopg2.extras import execute_values
import requests

BULK_DIR = Path(__file__).parent.parent / "data" / "bulk"
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL")
HEADERS = {
    "User-Agent": "MTGInk/1.0 (card art popularity tracker)",
    "Accept": "application/json",
}

TAG_ENDPOINTS = {
    "illustration": "https://api.scryfall.com/private/tags/illustration",
    "oracle": "https://api.scryfall.com/private/tags/oracle",
}

BATCH_SIZE = 5000


def slugify(label):
    """Convert a tag label to a URL-friendly slug."""
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", label)
    return re.sub(r"\s+", "-", s).lower()


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
    """Import tags from downloaded JSON files into Postgres."""
    cur = conn.cursor()

    # Clear existing data
    print("Clearing existing tags...")
    cur.execute("DELETE FROM illustration_tags")
    cur.execute("DELETE FROM oracle_tags")
    cur.execute("DELETE FROM tags")
    conn.commit()

    total_tags = 0
    total_illustration_assoc = 0
    total_oracle_assoc = 0

    # --- Illustration tags ---
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
        tag_rows.append((tag_id, tag["label"], slugify(tag["label"]), "illustration", tag.get("description")))
        for ill_id in tag.get("illustration_ids", []):
            assoc_rows.append((ill_id, tag_id))

    execute_values(
        cur,
        "INSERT INTO tags (tag_id, label, slug, type, description) VALUES %s ON CONFLICT (tag_id) DO UPDATE SET label = EXCLUDED.label, slug = EXCLUDED.slug, description = EXCLUDED.description",
        tag_rows,
    )
    conn.commit()

    # Batch insert associations
    for i in range(0, len(assoc_rows), BATCH_SIZE):
        batch = assoc_rows[i : i + BATCH_SIZE]
        execute_values(
            cur,
            "INSERT INTO illustration_tags (illustration_id, tag_id) VALUES %s ON CONFLICT DO NOTHING",
            batch,
        )
        conn.commit()
        print(f"\r  illustration_tags: {min(i + BATCH_SIZE, len(assoc_rows)):,}/{len(assoc_rows):,}", end="", flush=True)

    total_tags += len(tag_rows)
    total_illustration_assoc = len(assoc_rows)
    print(f"\n  {len(tag_rows)} tags, {len(assoc_rows):,} associations")

    # --- Oracle tags ---
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
        tag_rows.append((tag_id, tag["label"], slugify(tag["label"]), "oracle", tag.get("description")))
        for oracle_id in tag.get("oracle_ids", []):
            assoc_rows.append((oracle_id, tag_id))

    execute_values(
        cur,
        "INSERT INTO tags (tag_id, label, slug, type, description) VALUES %s ON CONFLICT (tag_id) DO UPDATE SET label = EXCLUDED.label, slug = EXCLUDED.slug, description = EXCLUDED.description",
        tag_rows,
    )
    conn.commit()

    # Batch insert associations — skip oracle_ids not in oracle_cards
    for i in range(0, len(assoc_rows), BATCH_SIZE):
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
        print(f"\r  oracle_tags: {min(i + BATCH_SIZE, len(assoc_rows)):,}/{len(assoc_rows):,}", end="", flush=True)

    total_tags += len(tag_rows)
    total_oracle_assoc = len(assoc_rows)
    print(f"\n  {len(tag_rows)} tags, {len(assoc_rows):,} associations")

    # Deduplicate slugs (append type, then tag_id prefix if still duped)
    cur.execute("UPDATE tags SET slug = slug || '-' || type WHERE slug IN (SELECT slug FROM tags GROUP BY slug HAVING COUNT(*) > 1)")
    cur.execute("UPDATE tags SET slug = slug || '-' || LEFT(tag_id::TEXT, 8) WHERE slug IN (SELECT slug FROM tags GROUP BY slug HAVING COUNT(*) > 1)")
    conn.commit()

    # Update usage_count
    print("Updating usage_count...")
    cur.execute("""
        UPDATE tags SET usage_count = COALESCE(sub.cnt, 0)
        FROM (
            SELECT tag_id, COUNT(*) AS cnt FROM illustration_tags GROUP BY tag_id
            UNION ALL
            SELECT tag_id, COUNT(*) AS cnt FROM oracle_tags GROUP BY tag_id
        ) sub
        WHERE tags.tag_id = sub.tag_id
    """)
    conn.commit()

    # Summary
    print(f"\n=== Tag Import Summary ===")
    print(f"  Total tags: {total_tags:,}")
    print(f"  Illustration associations: {total_illustration_assoc:,}")
    print(f"  Oracle associations: {total_oracle_assoc:,}")

    # Spot check
    cur.execute("""
        SELECT t.label
        FROM illustration_tags it
        JOIN tags t ON it.tag_id = t.tag_id
        WHERE it.illustration_id = (
            SELECT illustration_id FROM printings WHERE name = 'Lightning Bolt' LIMIT 1
        )
        ORDER BY t.label
        LIMIT 10
    """)
    rows = cur.fetchall()
    if rows:
        labels = [r[0] for r in rows]
        print(f"\n  Lightning Bolt art tags (sample): {', '.join(labels)}")

    cur.close()


def main():
    if not SUPABASE_DB_URL:
        print("ERROR: Set SUPABASE_DB_URL environment variable")
        print("  export SUPABASE_DB_URL=$(grep SUPABASE_DB_URL web/.env.prod | cut -d= -f2-)")
        sys.exit(1)

    start = time.time()

    download_tags()

    conn = psycopg2.connect(SUPABASE_DB_URL)
    import_tags(conn)
    conn.close()

    elapsed = time.time() - start
    print(f"\nTotal time: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
