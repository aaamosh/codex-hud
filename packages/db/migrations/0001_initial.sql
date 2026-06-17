PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  role_summary TEXT,
  locale TEXT,
  created_at TEXT NOT NULL,
  blocked_at TEXT
);

CREATE TABLE IF NOT EXISTS giver_offers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('plus', 'pro')),
  language TEXT NOT NULL,
  region TEXT NOT NULL,
  timezone TEXT NOT NULL,
  capacity_total INTEGER NOT NULL CHECK (capacity_total > 0),
  capacity_active INTEGER NOT NULL CHECK (capacity_active >= 0),
  state TEXT NOT NULL CHECK (state IN ('active', 'paused', 'reserved', 'exhausted', 'cancelled', 'archived')),
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS seeker_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  language TEXT NOT NULL,
  region TEXT NOT NULL,
  timezone TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  email_masked TEXT NOT NULL,
  email_ciphertext TEXT,
  availability_window_minutes INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'reserved', 'matched', 'completed', 'cancelled', 'archived', 'blocked')),
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  giver_offer_id TEXT NOT NULL REFERENCES giver_offers(id),
  seeker_request_id TEXT NOT NULL REFERENCES seeker_requests(id),
  state TEXT NOT NULL CHECK (state IN ('reserved', 'giver_sent', 'seeker_received', 'awaiting_final_confirmation', 'completed', 'cancelled', 'expired', 'admin_resolved')),
  reserved_until TEXT NOT NULL,
  invite_sent_at TEXT,
  seeker_received_at TEXT,
  seeker_completed_action_at TEXT,
  giver_confirmed_at TEXT,
  seeker_confirmed_at TEXT,
  closed_at TEXT,
  close_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS confirmations (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('giver_sent', 'seeker_received', 'seeker_completed', 'admin_resolved')),
  created_at TEXT NOT NULL,
  UNIQUE (match_id, user_id, kind)
);

CREATE TABLE IF NOT EXISTS abuse_flags (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  email_hash TEXT,
  reason_code TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reason_code TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS archived_records (
  id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  record_json TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  UNIQUE (source_table, source_id)
);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id INTEGER PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  flow TEXT NOT NULL,
  step TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_blocked_at ON users(blocked_at);
CREATE INDEX IF NOT EXISTS idx_giver_offers_state_language ON giver_offers(state, language, created_at);
CREATE INDEX IF NOT EXISTS idx_giver_offers_user_state ON giver_offers(user_id, state);
CREATE INDEX IF NOT EXISTS idx_seeker_requests_state_language ON seeker_requests(state, language, created_at);
CREATE INDEX IF NOT EXISTS idx_seeker_requests_email_state ON seeker_requests(email_hash, state, created_at);
CREATE INDEX IF NOT EXISTS idx_matches_state_reserved_until ON matches(state, reserved_until);
CREATE INDEX IF NOT EXISTS idx_matches_giver_offer ON matches(giver_offer_id);
CREATE INDEX IF NOT EXISTS idx_matches_seeker_request ON matches(seeker_request_id);
CREATE INDEX IF NOT EXISTS idx_abuse_flags_user ON abuse_flags(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_abuse_flags_email ON abuse_flags(email_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_user_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_seeker_by_user
ON seeker_requests(user_id)
WHERE state IN ('pending', 'reserved', 'matched');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_seeker_by_email
ON seeker_requests(email_hash)
WHERE state IN ('pending', 'reserved', 'matched');

