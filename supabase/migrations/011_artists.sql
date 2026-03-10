-- Artists table and popularity stats

CREATE TABLE artists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  illustration_count INTEGER NOT NULL DEFAULT 0,
  hero_set_code TEXT,
  hero_collector_number TEXT
);

CREATE INDEX idx_artists_slug ON artists(slug);
CREATE INDEX idx_artists_illustration_count ON artists(illustration_count DESC);
CREATE INDEX idx_artists_name_trgm ON artists USING gin (name gin_trgm_ops);

-- Index on printings.artist for fast artist detail lookups
CREATE INDEX IF NOT EXISTS idx_printings_artist ON printings(artist);
CREATE INDEX IF NOT EXISTS idx_printings_artist_illustration ON printings(artist, illustration_id);

-- Pre-computed popularity stats per time period
CREATE TABLE artist_stats (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  period TEXT NOT NULL,  -- 'week', 'month', 'all'
  total_votes INTEGER NOT NULL DEFAULT 0,
  total_wins INTEGER NOT NULL DEFAULT 0,
  avg_elo REAL,
  top_illustration_id UUID,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (artist_id, period)
);

CREATE INDEX idx_artist_stats_period_votes ON artist_stats(period, total_votes DESC);

-- RLS
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read artists" ON artists FOR SELECT USING (true);
CREATE POLICY "Service role write artists" ON artists FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read artist_stats" ON artist_stats FOR SELECT USING (true);
CREATE POLICY "Service role write artist_stats" ON artist_stats FOR ALL USING (auth.role() = 'service_role');

-- Get all illustrations by an artist with ratings and card info
CREATE OR REPLACE FUNCTION get_artist_illustrations(p_artist_name TEXT)
RETURNS TABLE (
  illustration_id UUID,
  oracle_id UUID,
  card_name TEXT,
  card_slug TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  elo_rating REAL,
  vote_count INTEGER,
  win_count INTEGER,
  loss_count INTEGER
) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (p.illustration_id)
    p.illustration_id,
    p.oracle_id,
    o.name AS card_name,
    o.slug AS card_slug,
    p.set_code,
    s.name AS set_name,
    p.collector_number,
    p.released_at,
    ar.elo_rating,
    ar.vote_count,
    ar.win_count,
    ar.loss_count
  FROM printings p
  JOIN oracle_cards o ON o.oracle_id = p.oracle_id
  JOIN sets s ON s.set_code = p.set_code
  LEFT JOIN art_ratings ar ON ar.illustration_id = p.illustration_id
  WHERE p.artist = p_artist_name
    AND p.illustration_id IS NOT NULL
    AND o.layout != 'art_series'
  ORDER BY p.illustration_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1
      WHEN 'core' THEN 2
      WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4
      WHEN 'commander' THEN 5
      ELSE 6
    END,
    p.released_at ASC;
$$;

-- pg_cron: nightly stats aggregation
-- Run after enabling pg_cron extension in Supabase dashboard:
--   SELECT cron.schedule('refresh-artist-stats', '0 4 * * *', $$SELECT refresh_artist_stats()$$);

CREATE OR REPLACE FUNCTION refresh_artist_stats()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- All time
  INSERT INTO artist_stats (artist_id, period, total_votes, total_wins, avg_elo, top_illustration_id, computed_at)
  SELECT
    a.id,
    'all',
    COALESCE(SUM(ar.vote_count), 0)::INTEGER,
    COALESCE(SUM(ar.win_count), 0)::INTEGER,
    AVG(ar.elo_rating),
    (SELECT ar2.illustration_id FROM art_ratings ar2
     JOIN printings p2 ON p2.illustration_id = ar2.illustration_id AND p2.artist = a.name
     ORDER BY ar2.elo_rating DESC LIMIT 1),
    NOW()
  FROM artists a
  LEFT JOIN printings p ON p.artist = a.name AND p.illustration_id IS NOT NULL
  LEFT JOIN art_ratings ar ON ar.illustration_id = p.illustration_id
  GROUP BY a.id
  ON CONFLICT (artist_id, period) DO UPDATE SET
    total_votes = EXCLUDED.total_votes,
    total_wins = EXCLUDED.total_wins,
    avg_elo = EXCLUDED.avg_elo,
    top_illustration_id = EXCLUDED.top_illustration_id,
    computed_at = NOW();

  -- Last 30 days
  INSERT INTO artist_stats (artist_id, period, total_votes, total_wins, avg_elo, top_illustration_id, computed_at)
  SELECT
    a.id,
    'month',
    COUNT(v.id)::INTEGER,
    COUNT(CASE WHEN v.winner_illustration_id = p.illustration_id THEN 1 END)::INTEGER,
    NULL,
    NULL,
    NOW()
  FROM artists a
  LEFT JOIN printings p ON p.artist = a.name AND p.illustration_id IS NOT NULL
  LEFT JOIN votes v ON (v.winner_illustration_id = p.illustration_id OR v.loser_illustration_id = p.illustration_id)
    AND v.voted_at >= NOW() - INTERVAL '30 days'
  GROUP BY a.id
  ON CONFLICT (artist_id, period) DO UPDATE SET
    total_votes = EXCLUDED.total_votes,
    total_wins = EXCLUDED.total_wins,
    computed_at = NOW();

  -- Last 7 days
  INSERT INTO artist_stats (artist_id, period, total_votes, total_wins, avg_elo, top_illustration_id, computed_at)
  SELECT
    a.id,
    'week',
    COUNT(v.id)::INTEGER,
    COUNT(CASE WHEN v.winner_illustration_id = p.illustration_id THEN 1 END)::INTEGER,
    NULL,
    NULL,
    NOW()
  FROM artists a
  LEFT JOIN printings p ON p.artist = a.name AND p.illustration_id IS NOT NULL
  LEFT JOIN votes v ON (v.winner_illustration_id = p.illustration_id OR v.loser_illustration_id = p.illustration_id)
    AND v.voted_at >= NOW() - INTERVAL '7 days'
  GROUP BY a.id
  ON CONFLICT (artist_id, period) DO UPDATE SET
    total_votes = EXCLUDED.total_votes,
    total_wins = EXCLUDED.total_wins,
    computed_at = NOW();
END;
$$;
