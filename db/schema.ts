export const SCHEMA_VERSION = "0000_taid_mvp";

// Keep every entry to exactly one SQLite statement. Runtime initialization
// executes these through D1 prepared statements (never D1.exec()).
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS taid_schema_migrations (
    version TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_request_id TEXT NOT NULL UNIQUE,
    structure_mode TEXT NOT NULL CHECK (structure_mode IN ('ai', 'rules', 'sample')),
    exclude_from_metrics INTEGER NOT NULL DEFAULT 0 CHECK (exclude_from_metrics IN (0, 1)),
    worker_code TEXT NOT NULL,
    work_order TEXT NOT NULL,
    product TEXT NOT NULL,
    process TEXT NOT NULL,
    equipment TEXT NOT NULL,
    transcript TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL CHECK (kind IN ('문제', '개선', '노하우')),
    quantity TEXT NOT NULL DEFAULT '',
    defect TEXT NOT NULL DEFAULT '',
    symptom TEXT NOT NULL DEFAULT '',
    cause TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '',
    confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    review_fields_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT '검토 대기' CHECK (status IN ('검토 대기', '승인', '반려')),
    reviewer_code TEXT,
    review_note TEXT,
    rejection_reason TEXT,
    reviewed_at TEXT,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_records_status_created_at
    ON records (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_records_metrics_created_at
    ON records (exclude_from_metrics, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_key TEXT NOT NULL,
    work_order TEXT NOT NULL,
    period_key TEXT NOT NULL,
    product TEXT NOT NULL DEFAULT '',
    process TEXT NOT NULL DEFAULT '',
    equipment TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds BETWEEN 0 AND 180),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (participant_key, work_order, period_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_check_ins_period_created_at
    ON check_ins (period_key, created_at DESC)`,
] as const;
