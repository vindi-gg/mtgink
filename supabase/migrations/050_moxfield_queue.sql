-- Queue for rate-limited Moxfield API requests (1 req/sec)
CREATE TABLE moxfield_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moxfield_deck_id TEXT NOT NULL,
  deck_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, done, error
  result JSONB,          -- { deckId, stats } on success
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_moxfield_queue_status ON moxfield_queue(status, created_at);

-- Lock row for processing serialization
CREATE TABLE moxfield_lock (
  key TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by TEXT
);

INSERT INTO moxfield_lock (key, locked_at) VALUES ('processor', '1970-01-01');

-- Clean up stale entries (stuck processing or abandoned)
-- Run every 5 minutes via pg_cron
SELECT cron.schedule(
  'cleanup-moxfield-queue',
  '*/5 * * * *',
  $$DELETE FROM moxfield_queue WHERE created_at < now() - interval '5 minutes'$$
);

-- RLS: public can insert and read their own queue entries
ALTER TABLE moxfield_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert" ON moxfield_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read" ON moxfield_queue FOR SELECT USING (true);
CREATE POLICY "Service role manages" ON moxfield_queue FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE moxfield_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON moxfield_lock FOR ALL USING (auth.role() = 'service_role');
