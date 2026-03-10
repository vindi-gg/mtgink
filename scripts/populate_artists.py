#!/usr/bin/env python3
"""Populate the artists table from printings data and compute stats."""

import os
import re
import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    raise RuntimeError("Set SUPABASE_DB_URL environment variable")


def slugify(name):
    """Convert an artist name to a URL slug (matches TypeScript slugify)."""
    s = name.lower()
    s = s.replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Get distinct artists with illustration counts and best illustration
    print("Fetching artist data from printings...")
    cur.execute("""
        SELECT
            p.artist,
            COUNT(DISTINCT p.illustration_id) AS illustration_count
        FROM printings p
        JOIN oracle_cards o ON o.oracle_id = p.oracle_id
        WHERE p.artist IS NOT NULL
          AND p.illustration_id IS NOT NULL
          AND o.layout != 'art_series'
        GROUP BY p.artist
        ORDER BY illustration_count DESC
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} distinct artists")

    # Compute slugs, handling collisions
    slug_counts = {}
    artists = []
    for name, ill_count in rows:
        slug = slugify(name)
        if not slug:
            slug = "unknown"
        if slug in slug_counts:
            slug_counts[slug] += 1
            slug = f"{slug}-{slug_counts[slug]}"
        else:
            slug_counts[slug] = 0
        artists.append((name, slug, ill_count))

    # Get hero illustration (highest-rated, preferring playable sets) for each artist
    print("Finding hero illustrations...")
    cur.execute("""
        SELECT DISTINCT ON (p.artist)
            p.artist,
            p.set_code,
            p.collector_number
        FROM printings p
        JOIN oracle_cards o ON o.oracle_id = p.oracle_id
        JOIN sets s ON s.set_code = p.set_code
        LEFT JOIN art_ratings ar ON ar.illustration_id = p.illustration_id
        WHERE p.artist IS NOT NULL
          AND p.illustration_id IS NOT NULL
          AND o.layout != 'art_series'
        ORDER BY p.artist,
          ar.elo_rating DESC NULLS LAST,
          CASE s.set_type
            WHEN 'expansion' THEN 1
            WHEN 'core' THEN 2
            WHEN 'masters' THEN 3
            WHEN 'draft_innovation' THEN 4
            WHEN 'commander' THEN 5
            ELSE 6
          END,
          p.released_at DESC
    """)
    hero_map = {row[0]: (row[1], row[2]) for row in cur.fetchall()}

    # Upsert artists
    print("Upserting artists...")
    values = []
    for name, slug, ill_count in artists:
        hero = hero_map.get(name, (None, None))
        values.append((name, slug, ill_count, hero[0], hero[1]))

    execute_values(cur, """
        INSERT INTO artists (name, slug, illustration_count, hero_set_code, hero_collector_number)
        VALUES %s
        ON CONFLICT (name) DO UPDATE SET
            slug = EXCLUDED.slug,
            illustration_count = EXCLUDED.illustration_count,
            hero_set_code = EXCLUDED.hero_set_code,
            hero_collector_number = EXCLUDED.hero_collector_number
    """, values)

    conn.commit()
    print(f"Upserted {len(values)} artists")

    # Compute stats
    print("Computing artist stats (this may take a minute)...")
    cur.execute("SELECT refresh_artist_stats()")
    conn.commit()
    print("Stats computed")

    cur.close()
    conn.close()
    print("Done!")


if __name__ == "__main__":
    main()
