-- Additive synchronization registry/state only.
-- No existing Laravel table or normalized operational row is altered or deleted.

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
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_sources_source_key_key" ON "sync_sources"("source_key");
CREATE UNIQUE INDEX "sync_sources_provider_external_id_key" ON "sync_sources"("provider", "external_id");

CREATE TABLE "sync_worksheets" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "worksheet_key" VARCHAR(64) NOT NULL,
    "worksheet_title" VARCHAR(255) NOT NULL,
    "normalized_title" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "first_seen_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(0),
    "schema_hash" VARCHAR(128),
    "content_hash" VARCHAR(128),
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_worksheets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sync_worksheets_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sync_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sync_worksheets_source_id_worksheet_key_key" ON "sync_worksheets"("source_id", "worksheet_key");
CREATE INDEX "sync_worksheets_source_id_status_idx" ON "sync_worksheets"("source_id", "status");

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
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sync_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sync_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "sync_runs_source_id_started_at_idx" ON "sync_runs"("source_id", "started_at");
CREATE INDEX "sync_runs_status_idx" ON "sync_runs"("status");

CREATE TABLE "sync_row_states" (
    "id" BIGSERIAL NOT NULL,
    "worksheet_id" BIGINT NOT NULL,
    "source_key" VARCHAR(512) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "content_hash" VARCHAR(128) NOT NULL,
    "last_seen_at" TIMESTAMP(0) NOT NULL,
    "last_synced_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_row_states_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sync_row_states_worksheet_id_fkey" FOREIGN KEY ("worksheet_id") REFERENCES "sync_worksheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sync_row_states_worksheet_id_source_key_key" ON "sync_row_states"("worksheet_id", "source_key");
CREATE INDEX "sync_row_states_worksheet_id_last_seen_at_idx" ON "sync_row_states"("worksheet_id", "last_seen_at");

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
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_schema_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sync_schema_changes_worksheet_id_fkey" FOREIGN KEY ("worksheet_id") REFERENCES "sync_worksheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "sync_schema_changes_worksheet_id_detected_at_idx" ON "sync_schema_changes"("worksheet_id", "detected_at");
CREATE INDEX "sync_schema_changes_status_idx" ON "sync_schema_changes"("status");
