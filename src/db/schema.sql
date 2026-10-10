-- MySQL 8+ schema (the production target). The embedded fallback runs the same file on SQLite.
CREATE TABLE IF NOT EXISTS plans (
  code VARCHAR(40) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  price_cents INT NOT NULL,
  frequency VARCHAR(10) NOT NULL,
  synthetic TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS calls (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  title VARCHAR(200) NULL,
  plan_code VARCHAR(40) NOT NULL,
  member_name VARCHAR(120) NOT NULL,
  caller_role VARCHAR(20) NOT NULL,
  family_signup TINYINT NOT NULL,
  family_reason TEXT NULL,
  detector VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS segments (
  call_id VARCHAR(40) NOT NULL,
  seg_id INT NOT NULL,
  speaker VARCHAR(10) NOT NULL,
  start_s DOUBLE NOT NULL,
  end_s DOUBLE NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (call_id, seg_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ledger_items (
  call_id VARCHAR(40) NOT NULL,
  item_id VARCHAR(8) NOT NULL,
  label VARCHAR(200) NOT NULL,
  clause VARCHAR(120) NOT NULL,
  status VARCHAR(12) NOT NULL,
  quote TEXT NULL,
  segment_ids VARCHAR(200) NOT NULL,
  start_s DOUBLE NULL,
  ack VARCHAR(12) NOT NULL,
  ack_quote TEXT NULL,
  ack_start_s DOUBLE NULL,
  source VARCHAR(10) NOT NULL,
  detail TEXT NULL,
  PRIMARY KEY (call_id, item_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registrations (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  call_id VARCHAR(40) NOT NULL,
  plan_code VARCHAR(40) NOT NULL,
  member_name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount_cents INT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS overrides (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  registration_id VARCHAR(40) NOT NULL,
  supervisor_id VARCHAR(80) NOT NULL,
  reason TEXT NOT NULL,
  blocking VARCHAR(200) NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

-- One first charge per registration, enforced by the database too.
CREATE TABLE IF NOT EXISTS charges (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  registration_id VARCHAR(40) NOT NULL UNIQUE,
  amount_cents INT NOT NULL,
  processor VARCHAR(20) NOT NULL,
  override_id VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  seq BIGINT NOT NULL PRIMARY KEY,
  registration_id VARCHAR(40) NULL,
  call_id VARCHAR(40) NULL,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(40) NOT NULL,
  detail TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE INDEX idx_registrations_call ON registrations (call_id);
CREATE INDEX idx_overrides_reg ON overrides (registration_id);
CREATE INDEX idx_audit_reg ON audit_log (registration_id);
