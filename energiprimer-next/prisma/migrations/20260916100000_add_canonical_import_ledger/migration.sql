-- Additive Phase 5 durable plan and batch ledger.
-- This migration is application-history evidence only until the separately
-- approved Production migration rollout is completed. No business table is
-- altered and no row is deleted.

CREATE TABLE "canonical_import_runs" (
    "id" BIGSERIAL NOT NULL,
    "plan_id" VARCHAR(128) NOT NULL,
    "plan_hash" VARCHAR(128) NOT NULL,
    "import_run_id" VARCHAR(255) NOT NULL,
    "source_key" VARCHAR(128) NOT NULL,
    "spreadsheet_id" VARCHAR(255) NOT NULL,
    "sheet_id" VARCHAR(255) NOT NULL,
    "worksheet_title" VARCHAR(255) NOT NULL,
    "source_range" VARCHAR(255) NOT NULL,
    "effective_period" DATE,
    "mapping_profile" VARCHAR(128) NOT NULL,
    "mapping_version" VARCHAR(128) NOT NULL,
    "schema_version" VARCHAR(128) NOT NULL,
    "parser_version" VARCHAR(128) NOT NULL,
    "schema_fingerprint" VARCHAR(128),
    "source_manifest" TEXT NOT NULL,
    "plan_snapshot" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "approval_state" VARCHAR(32) NOT NULL,
    "total_items" INTEGER NOT NULL,
    "planned_insert" INTEGER NOT NULL DEFAULT 0,
    "planned_update" INTEGER NOT NULL DEFAULT 0,
    "planned_skip" INTEGER NOT NULL DEFAULT 0,
    "planned_block" INTEGER NOT NULL DEFAULT 0,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "execution_id" VARCHAR(128),
    "started_at" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failure_code" VARCHAR(64),
    "failure_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "canonical_import_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "canonical_import_runs_status_check" CHECK ("status" IN ('APPROVED', 'COMMITTING', 'COMMITTED', 'RECONCILIATION_REQUIRED', 'RECONCILED', 'FAILED', 'BLOCKED')),
    CONSTRAINT "canonical_import_runs_approval_check" CHECK ("approval_state" = 'APPROVED')
);

CREATE UNIQUE INDEX "canonical_import_runs_plan_id_key" ON "canonical_import_runs"("plan_id");
CREATE UNIQUE INDEX "canonical_import_runs_plan_hash_key" ON "canonical_import_runs"("plan_hash");
CREATE INDEX "canonical_import_runs_source_key_created_at_idx" ON "canonical_import_runs"("source_key", "created_at");
CREATE INDEX "canonical_import_runs_status_updated_at_idx" ON "canonical_import_runs"("status", "updated_at");

CREATE TABLE "canonical_import_batches" (
    "id" BIGSERIAL NOT NULL,
    "run_id" BIGINT NOT NULL,
    "batch_number" INTEGER NOT NULL,
    "plan_hash" VARCHAR(128) NOT NULL,
    "item_count" INTEGER NOT NULL,
    "item_manifest" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "execution_id" VARCHAR(128),
    "started_at" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "committed_item_count" INTEGER NOT NULL DEFAULT 0,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "failure_code" VARCHAR(64),
    "failure_summary" TEXT,
    "observation_snapshot" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "canonical_import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "canonical_import_batches_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'COMMITTED', 'FAILED', 'RECONCILIATION_REQUIRED')),
    CONSTRAINT "canonical_import_batches_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "canonical_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "canonical_import_batches_run_id_batch_number_key" ON "canonical_import_batches"("run_id", "batch_number");
CREATE INDEX "canonical_import_batches_run_id_status_idx" ON "canonical_import_batches"("run_id", "status");
CREATE INDEX "canonical_import_batches_plan_hash_idx" ON "canonical_import_batches"("plan_hash");
