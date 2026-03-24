-- Supabase schema for Jump AI Jump persistent storage
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE IF NOT EXISTS galaxies (
  galaxy_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  planets     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_galaxies_is_current ON galaxies (is_current) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_galaxies_created_at ON galaxies (created_at DESC);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  galaxy_id      TEXT NOT NULL REFERENCES galaxies(galaxy_id),
  player_id      TEXT NOT NULL,
  player_name    TEXT NOT NULL DEFAULT 'Anonymous',
  highest_stage  INTEGER NOT NULL DEFAULT 0,
  total_jumps    INTEGER NOT NULL DEFAULT 0,
  time_ms        INTEGER NOT NULL DEFAULT 0,
  human_tourist  BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (galaxy_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_lb_galaxy ON leaderboard_entries (galaxy_id);
CREATE INDEX IF NOT EXISTS idx_lb_ranking ON leaderboard_entries (highest_stage DESC, time_ms ASC);

CREATE TABLE IF NOT EXISTS llm_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage       TEXT,
  input       JSONB,
  response    JSONB,
  latency_ms  INTEGER,
  error       TEXT,
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_logs_created ON llm_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Prevents direct access via the Supabase anon/publishable key.
-- The server should use the service_role key for full access.
-- ---------------------------------------------------------------------------

ALTER TABLE galaxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_logs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by the Express server)
CREATE POLICY "service_role_all" ON galaxies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON leaderboard_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON llm_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon users can only read galaxies and leaderboards (public data)
CREATE POLICY "anon_read_galaxies" ON galaxies FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_leaderboards" ON leaderboard_entries FOR SELECT TO anon USING (true);
