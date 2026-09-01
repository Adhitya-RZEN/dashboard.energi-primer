-- Additive migration only.
-- This migration does not alter or delete any existing Laravel table/data.

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
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spreadsheet_import_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spreadsheet_import_runs_status_idx" ON "spreadsheet_import_runs" ("status");
CREATE INDEX "spreadsheet_import_runs_requested_period_idx" ON "spreadsheet_import_runs" ("requested_period");

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
    "normalized_value" NUMERIC(18,3),
    "value_unit" VARCHAR(20),
    "validation_status" VARCHAR(32) NOT NULL,
    "validation_message" TEXT,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spreadsheet_import_staging_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "spreadsheet_import_staging_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "spreadsheet_import_staging_import_run_id_idx" ON "spreadsheet_import_staging" ("import_run_id");
CREATE INDEX "spreadsheet_import_staging_entity_type_validation_status_idx" ON "spreadsheet_import_staging" ("entity_type", "validation_status");

CREATE TABLE "biomass_receipts" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "period_start" DATE NOT NULL,
    "supplier_code" VARCHAR(100) NOT NULL,
    "supplier_name" VARCHAR(255) NOT NULL,
    "quantity_ton" NUMERIC(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "biomass_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "biomass_receipts_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "biomass_receipts_period_start_supplier_code_key" ON "biomass_receipts" ("period_start", "supplier_code");
CREATE INDEX "biomass_receipts_period_start_idx" ON "biomass_receipts" ("period_start");

CREATE TABLE "biomass_consumptions" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "unit_id" BIGINT NOT NULL,
    "reading_date" DATE NOT NULL,
    "quantity_ton" NUMERIC(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "biomass_consumptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "biomass_consumptions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "biomass_consumptions_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "biomass_consumptions_unit_id_reading_date_key" ON "biomass_consumptions" ("unit_id", "reading_date");
CREATE INDEX "biomass_consumptions_reading_date_idx" ON "biomass_consumptions" ("reading_date");

CREATE TABLE "solar_receipts" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "period_start" DATE NOT NULL,
    "quantity_liter" NUMERIC(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "solar_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "solar_receipts_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "solar_receipts_period_start_key" ON "solar_receipts" ("period_start");

CREATE TABLE "solar_consumptions" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "reading_date" DATE NOT NULL,
    "quantity_liter" NUMERIC(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "solar_consumptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "solar_consumptions_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "solar_consumptions_reading_date_key" ON "solar_consumptions" ("reading_date");

CREATE TABLE "hop_readings" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "unit_id" BIGINT NOT NULL,
    "reading_date" DATE NOT NULL,
    "hop_days" NUMERIC(8,2),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hop_readings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hop_readings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hop_readings_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "hop_readings_unit_id_reading_date_key" ON "hop_readings" ("unit_id", "reading_date");
CREATE INDEX "hop_readings_reading_date_idx" ON "hop_readings" ("reading_date");

CREATE TABLE "biomass_targets" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "target_year" INTEGER NOT NULL,
    "target_ton" NUMERIC(18,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'ton',
    "source" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "biomass_targets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "biomass_targets_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "biomass_targets_target_ton_positive_check" CHECK ("target_ton" > 0)
);

CREATE UNIQUE INDEX "biomass_targets_target_year_key" ON "biomass_targets" ("target_year");

CREATE TABLE "biomass_cumulative_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "period_start" DATE NOT NULL,
    "cumulative_ton" NUMERIC(18,3),
    "source" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "biomass_cumulative_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "biomass_cumulative_snapshots_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "biomass_cumulative_snapshots_period_start_key" ON "biomass_cumulative_snapshots" ("period_start");
