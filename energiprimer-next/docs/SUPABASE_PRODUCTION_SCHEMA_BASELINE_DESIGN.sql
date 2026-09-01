-- PHASE 21C DESIGN ARTIFACT
-- SUPABASE PRODUCTION SCHEMA BASELINE
-- STATUS: DESIGN-ONLY / NOT DEPLOYABLE
--
-- Generated read-only with Prisma 6.19.3 from prisma/schema.prisma.
-- Do not execute this file directly. Do not place it under prisma/migrations
-- until the separate production migration history has received manual approval.
-- No data, credentials, Google Sheets content, or environment values are included.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(0),
    "password" TEXT NOT NULL,
    "remember_token" VARCHAR(100),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "role" TEXT NOT NULL DEFAULT 'admin',
    "last_login_at" TIMESTAMP(0),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(0),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "payload" TEXT NOT NULL,
    "last_activity" INTEGER NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiration" BIGINT NOT NULL,

    CONSTRAINT "cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "cache_locks" (
    "key" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiration" BIGINT NOT NULL,

    CONSTRAINT "cache_locks_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" BIGSERIAL NOT NULL,
    "queue" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" SMALLINT NOT NULL,
    "reserved_at" INTEGER,
    "available_at" INTEGER NOT NULL,
    "created_at" INTEGER NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total_jobs" INTEGER NOT NULL,
    "pending_jobs" INTEGER NOT NULL,
    "failed_jobs" INTEGER NOT NULL,
    "failed_job_ids" TEXT NOT NULL,
    "options" TEXT,
    "cancelled_at" INTEGER,
    "created_at" INTEGER NOT NULL,
    "finished_at" INTEGER,

    CONSTRAINT "job_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_jobs" (
    "id" BIGSERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "connection" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "exception" TEXT NOT NULL,
    "failed_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coal_stock" (
    "id" BIGSERIAL NOT NULL,
    "date" DATE NOT NULL,
    "opening_stock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "received" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "consumed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closing_stock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "coal_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coal_quality" (
    "id" BIGSERIAL NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "gar" DECIMAL(8,2),
    "moisture" DECIMAL(5,2),
    "ash" DECIMAL(5,2),
    "sulfur" DECIMAL(5,3),
    "hgi" DECIMAL(5,2),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "coal_quality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coal_consumption" (
    "id" BIGSERIAL NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "coal_used" DECIMAL(12,2),
    "sfc" DECIMAL(8,2),
    "heat_rate" DECIMAL(8,2),
    "boiler_efficiency" DECIMAL(5,2),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "coal_consumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "power_generation" (
    "id" BIGSERIAL NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "average_load" DECIMAL(8,2),
    "power_generation" DECIMAL(12,2),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "power_generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_targets" (
    "id" BIGSERIAL NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "target_sfc" DECIMAL(8,2),
    "actual_sfc" DECIMAL(8,2),
    "target_heat_rate" DECIMAL(8,2),
    "actual_heat_rate" DECIMAL(8,2),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "kpi_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_import_logs" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "imported_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "spreadsheet_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_sources" (
    "id" BIGSERIAL NOT NULL,
    "source_key" VARCHAR(128) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "last_discovered_at" TIMESTAMP(0),
    "lock_token" VARCHAR(128),
    "lock_expires_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "sync_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_worksheets" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "worksheet_key" VARCHAR(64) NOT NULL,
    "worksheet_title" VARCHAR(255) NOT NULL,
    "normalized_title" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "first_seen_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(0) NOT NULL,
    "last_sync_at" TIMESTAMP(0),
    "schema_hash" VARCHAR(128),
    "schema_snapshot" TEXT,
    "content_hash" VARCHAR(128),
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "sync_worksheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "trigger_type" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "started_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(0),
    "worksheets_scanned" INTEGER NOT NULL DEFAULT 0,
    "rows_scanned" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "error_summary" TEXT,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_row_states" (
    "id" BIGSERIAL NOT NULL,
    "worksheet_id" BIGINT NOT NULL,
    "source_key" VARCHAR(512) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "content_hash" VARCHAR(128) NOT NULL,
    "last_seen_at" TIMESTAMP(0) NOT NULL,
    "last_synced_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "sync_row_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_schema_changes" (
    "id" BIGSERIAL NOT NULL,
    "worksheet_id" BIGINT NOT NULL,
    "detected_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_schema_hash" VARCHAR(128),
    "current_schema_hash" VARCHAR(128) NOT NULL,
    "change_type" VARCHAR(32) NOT NULL,
    "previous_schema" TEXT,
    "current_schema" TEXT,
    "status" VARCHAR(32) NOT NULL,
    "resolution" TEXT,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "sync_schema_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_import_runs" (
    "id" BIGSERIAL NOT NULL,
    "source" VARCHAR(255) NOT NULL,
    "requested_worksheet" VARCHAR(255) NOT NULL,
    "effective_worksheet" VARCHAR(255),
    "source_range" VARCHAR(255) NOT NULL,
    "requested_period" DATE NOT NULL,
    "effective_period" DATE,
    "status" VARCHAR(32) NOT NULL,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "rejected_rows" INTEGER NOT NULL DEFAULT 0,
    "checksum" VARCHAR(128),
    "message" TEXT,
    "started_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "spreadsheet_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_import_staging" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_row" INTEGER,
    "source_column" INTEGER,
    "source_address" VARCHAR(32),
    "period_start" DATE,
    "reading_date" DATE,
    "unit_code" VARCHAR(20),
    "supplier_code" VARCHAR(100),
    "raw_value" TEXT,
    "normalized_value" DECIMAL(18,3),
    "value_unit" VARCHAR(20),
    "validation_status" VARCHAR(32) NOT NULL,
    "validation_message" TEXT,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spreadsheet_import_staging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biomass_receipts" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "period_start" DATE NOT NULL,
    "supplier_code" VARCHAR(100) NOT NULL,
    "supplier_name" VARCHAR(255) NOT NULL,
    "quantity_ton" DECIMAL(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "biomass_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coal_receipts" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "period_start" DATE NOT NULL,
    "quantity_ton" DECIMAL(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "coal_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biomass_consumptions" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "unit_id" BIGINT NOT NULL,
    "reading_date" DATE NOT NULL,
    "quantity_ton" DECIMAL(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "biomass_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solar_receipts" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "period_start" DATE NOT NULL,
    "quantity_liter" DECIMAL(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "solar_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solar_consumptions" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "reading_date" DATE NOT NULL,
    "quantity_liter" DECIMAL(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "solar_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hop_readings" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "unit_id" BIGINT NOT NULL,
    "reading_date" DATE NOT NULL,
    "hop_days" DECIMAL(8,2),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "hop_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biomass_targets" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "target_year" INTEGER NOT NULL,
    "target_ton" DECIMAL(18,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'ton',
    "source" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "biomass_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biomass_cumulative_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "period_start" DATE NOT NULL,
    "cumulative_ton" DECIMAL(18,3),
    "source" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "biomass_cumulative_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_last_activity_idx" ON "sessions"("last_activity");

-- CreateIndex
CREATE INDEX "cache_expiration_idx" ON "cache"("expiration");

-- CreateIndex
CREATE INDEX "cache_locks_expiration_idx" ON "cache_locks"("expiration");

-- CreateIndex
CREATE INDEX "jobs_queue_idx" ON "jobs"("queue");

-- CreateIndex
CREATE UNIQUE INDEX "failed_jobs_uuid_key" ON "failed_jobs"("uuid");

-- CreateIndex
CREATE INDEX "failed_jobs_connection_queue_failed_at_idx" ON "failed_jobs"("connection", "queue", "failed_at");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coal_stock_date_key" ON "coal_stock"("date");

-- CreateIndex
CREATE UNIQUE INDEX "coal_quality_unit_id_date_key" ON "coal_quality"("unit_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "coal_consumption_unit_id_date_key" ON "coal_consumption"("unit_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "power_generation_unit_id_date_key" ON "power_generation"("unit_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_targets_unit_id_date_key" ON "kpi_targets"("unit_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sync_sources_source_key_key" ON "sync_sources"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "sync_sources_provider_external_id_key" ON "sync_sources"("provider", "external_id");

-- CreateIndex
CREATE INDEX "sync_worksheets_source_id_status_idx" ON "sync_worksheets"("source_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sync_worksheets_source_id_worksheet_key_key" ON "sync_worksheets"("source_id", "worksheet_key");

-- CreateIndex
CREATE INDEX "sync_runs_source_id_started_at_idx" ON "sync_runs"("source_id", "started_at");

-- CreateIndex
CREATE INDEX "sync_runs_status_idx" ON "sync_runs"("status");

-- CreateIndex
CREATE INDEX "sync_row_states_worksheet_id_last_seen_at_idx" ON "sync_row_states"("worksheet_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_row_states_worksheet_id_source_key_key" ON "sync_row_states"("worksheet_id", "source_key");

-- CreateIndex
CREATE INDEX "sync_schema_changes_worksheet_id_detected_at_idx" ON "sync_schema_changes"("worksheet_id", "detected_at");

-- CreateIndex
CREATE INDEX "sync_schema_changes_status_idx" ON "sync_schema_changes"("status");

-- CreateIndex
CREATE INDEX "spreadsheet_import_runs_status_idx" ON "spreadsheet_import_runs"("status");

-- CreateIndex
CREATE INDEX "spreadsheet_import_runs_requested_period_idx" ON "spreadsheet_import_runs"("requested_period");

-- CreateIndex
CREATE INDEX "spreadsheet_import_staging_import_run_id_idx" ON "spreadsheet_import_staging"("import_run_id");

-- CreateIndex
CREATE INDEX "spreadsheet_import_staging_entity_type_validation_status_idx" ON "spreadsheet_import_staging"("entity_type", "validation_status");

-- CreateIndex
CREATE INDEX "biomass_receipts_period_start_idx" ON "biomass_receipts"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "biomass_receipts_period_start_supplier_code_key" ON "biomass_receipts"("period_start", "supplier_code");

-- CreateIndex
CREATE UNIQUE INDEX "coal_receipts_period_start_key" ON "coal_receipts"("period_start");

-- CreateIndex
CREATE INDEX "biomass_consumptions_reading_date_idx" ON "biomass_consumptions"("reading_date");

-- CreateIndex
CREATE UNIQUE INDEX "biomass_consumptions_unit_id_reading_date_key" ON "biomass_consumptions"("unit_id", "reading_date");

-- CreateIndex
CREATE UNIQUE INDEX "solar_receipts_period_start_key" ON "solar_receipts"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "solar_consumptions_reading_date_key" ON "solar_consumptions"("reading_date");

-- CreateIndex
CREATE INDEX "hop_readings_reading_date_idx" ON "hop_readings"("reading_date");

-- CreateIndex
CREATE UNIQUE INDEX "hop_readings_unit_id_reading_date_key" ON "hop_readings"("unit_id", "reading_date");

-- CreateIndex
CREATE UNIQUE INDEX "biomass_targets_target_year_key" ON "biomass_targets"("target_year");

-- CreateIndex
CREATE UNIQUE INDEX "biomass_cumulative_snapshots_period_start_key" ON "biomass_cumulative_snapshots"("period_start");

-- AddForeignKey
ALTER TABLE "coal_quality" ADD CONSTRAINT "coal_quality_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coal_consumption" ADD CONSTRAINT "coal_consumption_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_generation" ADD CONSTRAINT "power_generation_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_worksheets" ADD CONSTRAINT "sync_worksheets_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sync_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sync_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_row_states" ADD CONSTRAINT "sync_row_states_worksheet_id_fkey" FOREIGN KEY ("worksheet_id") REFERENCES "sync_worksheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_schema_changes" ADD CONSTRAINT "sync_schema_changes_worksheet_id_fkey" FOREIGN KEY ("worksheet_id") REFERENCES "sync_worksheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_import_staging" ADD CONSTRAINT "spreadsheet_import_staging_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biomass_receipts" ADD CONSTRAINT "biomass_receipts_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coal_receipts" ADD CONSTRAINT "coal_receipts_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biomass_consumptions" ADD CONSTRAINT "biomass_consumptions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biomass_consumptions" ADD CONSTRAINT "biomass_consumptions_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solar_receipts" ADD CONSTRAINT "solar_receipts_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solar_consumptions" ADD CONSTRAINT "solar_consumptions_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hop_readings" ADD CONSTRAINT "hop_readings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hop_readings" ADD CONSTRAINT "hop_readings_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biomass_targets" ADD CONSTRAINT "biomass_targets_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biomass_cumulative_snapshots" ADD CONSTRAINT "biomass_cumulative_snapshots_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



