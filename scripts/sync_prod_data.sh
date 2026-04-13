#!/bin/bash
# Sync production data to local Supabase instance
# Dumps data (not schema) from prod and restores into local DB
#
# Usage: ./scripts/sync_prod_data.sh
#
# Requires: local Supabase running (supabase start)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load prod DB URL from .env.prod
PROD_DB_URL=$(grep '^SUPABASE_DB_URL=' "$PROJECT_DIR/web/.env.prod" | cut -d= -f2-)
# Host-mapped port for external access, internal port for docker exec
LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
LOCAL_DB_URL_INTERNAL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
DUMP_FILE="/tmp/mtgink_prod_data.sql"

if [ -z "$PROD_DB_URL" ]; then
  echo "ERROR: SUPABASE_DB_URL not found in web/.env.prod"
  exit 1
fi

# Tables to sync (data only — schema comes from migrations)
TABLES=(
  sets
  oracle_cards
  printings
  card_faces
  art_ratings
  artists
  artist_stats
  tags
  illustration_tags
  oracle_tags
  ink_tags
  marketplaces
  prices
  gauntlet_themes
)

echo "==> Dumping data from prod..."
TABLE_ARGS=""
for t in "${TABLES[@]}"; do
  TABLE_ARGS="$TABLE_ARGS -t $t"
done

# Use docker container's pg_dump to connect to prod and dump data-only
docker exec supabase_db_mtgink pg_dump \
  "$PROD_DB_URL" \
  --data-only \
  --disable-triggers \
  $TABLE_ARGS \
  > "$DUMP_FILE"

echo "==> Dump complete: $(wc -c < "$DUMP_FILE" | tr -d ' ') bytes"

echo "==> Truncating local tables..."
# Truncate in reverse order to respect FK constraints
for (( i=${#TABLES[@]}-1; i>=0; i-- )); do
  docker exec supabase_db_mtgink psql "$LOCAL_DB_URL_INTERNAL" -c "TRUNCATE ${TABLES[$i]} CASCADE;" 2>/dev/null || true
done

echo "==> Restoring data to local DB..."
docker exec -i supabase_db_mtgink psql "$LOCAL_DB_URL_INTERNAL" < "$DUMP_FILE"

echo "==> Refreshing materialized views..."
docker exec supabase_db_mtgink psql "$LOCAL_DB_URL_INTERNAL" -c "
  DO \$\$
  DECLARE r RECORD;
  BEGIN
    FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'
    LOOP
      EXECUTE 'REFRESH MATERIALIZED VIEW ' || quote_ident(r.matviewname);
    END LOOP;
  END
  \$\$;
" 2>/dev/null || true

rm -f "$DUMP_FILE"
echo "==> Done! Local DB synced with prod data."
