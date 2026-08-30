-- Additive migration for the monthly coal receipt value that is not present
-- in the legacy coal_stock daily grain. Existing tables and rows are kept.
CREATE TABLE "coal_receipts" (
    "id" BIGSERIAL NOT NULL,
    "import_run_id" BIGINT,
    "period_start" DATE NOT NULL,
    "quantity_ton" DECIMAL(18,3),
    "source_worksheet" VARCHAR(255) NOT NULL,
    "source_cell" VARCHAR(32),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coal_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coal_receipts_period_start_key"
    ON "coal_receipts"("period_start");

CREATE INDEX "coal_receipts_import_run_id_idx"
    ON "coal_receipts"("import_run_id");

ALTER TABLE "coal_receipts"
    ADD CONSTRAINT "coal_receipts_import_run_id_fkey"
    FOREIGN KEY ("import_run_id") REFERENCES "spreadsheet_import_runs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
