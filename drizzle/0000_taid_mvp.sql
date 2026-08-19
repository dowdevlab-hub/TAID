CREATE TABLE IF NOT EXISTS `taid_schema_migrations` (
  `version` text PRIMARY KEY NOT NULL,
  `applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `client_request_id` text NOT NULL UNIQUE,
  `structure_mode` text NOT NULL CHECK (`structure_mode` IN ('ai', 'rules', 'sample')),
  `exclude_from_metrics` integer DEFAULT 0 NOT NULL CHECK (`exclude_from_metrics` IN (0, 1)),
  `worker_code` text NOT NULL,
  `work_order` text NOT NULL,
  `product` text NOT NULL,
  `process` text NOT NULL,
  `equipment` text NOT NULL,
  `transcript` text NOT NULL,
  `title` text DEFAULT '' NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('문제', '개선', '노하우')),
  `quantity` text DEFAULT '' NOT NULL,
  `defect` text DEFAULT '' NOT NULL,
  `symptom` text DEFAULT '' NOT NULL,
  `cause` text DEFAULT '' NOT NULL,
  `action` text DEFAULT '' NOT NULL,
  `result` text DEFAULT '' NOT NULL,
  `confidence` integer NOT NULL CHECK (`confidence` BETWEEN 0 AND 100),
  `review_fields_json` text DEFAULT '[]' NOT NULL,
  `status` text DEFAULT '검토 대기' NOT NULL CHECK (`status` IN ('검토 대기', '승인', '반려')),
  `reviewer_code` text,
  `review_note` text,
  `rejection_reason` text,
  `reviewed_at` text,
  `views` integer DEFAULT 0 NOT NULL CHECK (`views` >= 0),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_records_status_created_at` ON `records` (`status`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_records_metrics_created_at` ON `records` (`exclude_from_metrics`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `check_ins` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `participant_key` text NOT NULL,
  `work_order` text NOT NULL,
  `period_key` text NOT NULL,
  `product` text DEFAULT '' NOT NULL,
  `process` text DEFAULT '' NOT NULL,
  `equipment` text DEFAULT '' NOT NULL,
  `duration_seconds` integer DEFAULT 0 NOT NULL CHECK (`duration_seconds` BETWEEN 0 AND 180),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `check_ins_participant_work_period_unique` UNIQUE (`participant_key`, `work_order`, `period_key`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_check_ins_period_created_at` ON `check_ins` (`period_key`, `created_at` DESC);
