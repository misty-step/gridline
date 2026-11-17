-- Undercurrent live observatory D1 schema (v1.0)
-- Persists live infrastructure pulse signals, EIA regional grid dispatch snapshots, and cron ingest runs.

CREATE TABLE IF NOT EXISTS live_signals (
  id TEXT PRIMARY KEY,
  stream TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  published_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  url TEXT NOT NULL,
  pdf_url TEXT,
  iso_regions_json TEXT,
  states_json TEXT,
  matched_facility_ids_json TEXT,
  epistemic TEXT NOT NULL,
  document_number TEXT,
  ticker_or_cik TEXT,
  peeringdb_fac_id INTEGER,
  ingested_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_signals_stream_date
  ON live_signals (stream, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_signals_published_at
  ON live_signals (published_at DESC);

CREATE TABLE IF NOT EXISTS grid_snapshots (
  iso_region TEXT PRIMARY KEY,
  eia_respondent TEXT NOT NULL,
  observed_at TEXT,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL
);
