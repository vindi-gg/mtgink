#!/usr/bin/env python3
"""One-time migration: SQLite votes DB → Supabase Postgres."""

import os
import sqlite3
import psycopg2
from psycopg2.extras import execute_values

VOTES_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mtgink_votes.db")
SUPABASE_DB_URL = os.environ["SUPABASE_DB_URL"]


def migrate_table(sqlite_cur, pg_cur, pg_conn, table, columns, pg_columns=None):
    """Generic table migration from SQLite to Postgres."""
    pg_cols = pg_columns or columns
    sqlite_cur.execute(f"SELECT {', '.join(columns)} FROM {table}")
    rows = sqlite_cur.fetchall()

    if not rows:
        print(f"  {table}: 0 rows (empty)")
        return

    placeholders = ", ".join(["%s"] * len(pg_cols))
    col_names = ", ".join(pg_cols)

    batch_size = 5000
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        execute_values(
            pg_cur,
            f"INSERT INTO {table} ({col_names}) VALUES %s ON CONFLICT DO NOTHING",
            batch,
            template=f"({placeholders})"
        )
        pg_conn.commit()
        total += len(batch)

    print(f"  {table}: {total} rows migrated")


def main():
    if not os.path.exists(VOTES_DB_PATH):
        print(f"SQLite votes DB not found at {VOTES_DB_PATH}")
        return

    sqlite_conn = sqlite3.connect(VOTES_DB_PATH)
    sqlite_cur = sqlite_conn.cursor()

    pg_conn = psycopg2.connect(SUPABASE_DB_URL)
    pg_cur = pg_conn.cursor()

    print("Migrating votes data from SQLite to Postgres...")

    # art_ratings
    migrate_table(
        sqlite_cur, pg_cur, pg_conn,
        "art_ratings",
        ["illustration_id", "oracle_id", "elo_rating", "vote_count", "win_count", "loss_count", "updated_at"]
    )

    # votes (skip user_id for now since SQLite has text IDs, Postgres expects UUIDs)
    migrate_table(
        sqlite_cur, pg_cur, pg_conn,
        "votes",
        ["oracle_id", "winner_illustration_id", "loser_illustration_id", "session_id", "vote_source", "voted_at"],
    )

    # favorites
    try:
        migrate_table(
            sqlite_cur, pg_cur, pg_conn,
            "favorites",
            ["user_id", "illustration_id", "oracle_id", "created_at"]
        )
    except Exception as e:
        print(f"  favorites: skipped ({e})")
        pg_conn.rollback()

    # decks
    try:
        migrate_table(
            sqlite_cur, pg_cur, pg_conn,
            "decks",
            ["id", "user_id", "name", "format", "source_url", "is_public", "created_at", "updated_at"]
        )
    except Exception as e:
        print(f"  decks: skipped ({e})")
        pg_conn.rollback()

    # deck_cards
    try:
        migrate_table(
            sqlite_cur, pg_cur, pg_conn,
            "deck_cards",
            ["deck_id", "oracle_id", "quantity", "section", "selected_illustration_id", "to_buy"]
        )
    except Exception as e:
        print(f"  deck_cards: skipped ({e})")
        pg_conn.rollback()

    # Verify counts
    print("\nVerification:")
    for table in ["art_ratings", "votes", "favorites", "decks", "deck_cards"]:
        try:
            sqlite_cur.execute(f"SELECT COUNT(*) FROM {table}")
            sqlite_count = sqlite_cur.fetchone()[0]
        except sqlite3.OperationalError:
            sqlite_count = 0

        pg_cur.execute(f"SELECT COUNT(*) FROM {table}")
        pg_count = pg_cur.fetchone()[0]

        match = "OK" if sqlite_count == pg_count else f"MISMATCH (sqlite={sqlite_count})"
        print(f"  {table}: {pg_count} rows [{match}]")

    sqlite_conn.close()
    pg_cur.close()
    pg_conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
