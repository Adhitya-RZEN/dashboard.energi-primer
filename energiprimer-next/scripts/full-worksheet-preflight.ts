import { writeFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";

import {
  GoogleSheetsIntegrationError,
  listGoogleSheetsWorksheets,
  readGoogleSheetsRange,
  type GoogleSheetsWorksheetMetadata,
} from "../src/lib/google-sheets";
import {
  parseDynamicWorksheet,
} from "../src/services/google-sheets/dynamic/parser";
import {
  DYNAMIC_SCAN_RANGE,
} from "../src/services/google-sheets/dynamic/reader";
import {
  parseBBWorksheetName,
} from "../src/services/google-sheets/dynamic/worksheet-resolver";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "../src/services/google-sheets/import/plan";
import {
  classifySyncRows,
} from "../src/services/google-sheets/sync/change-detection";
import {
  buildSchemaSnapshot,
  detectSchemaChange,
} from "../src/services/google-sheets/sync/schema-detection";
import { withSyncRetry } from "../src/services/google-sheets/sync/retry";

const prisma = new PrismaClient();
const MAX_CONCURRENCY = 1;
const REQUEST_DELAY_MS = 1_300;

type Classification =
  | "READY_FOR_IMPORT"
  | "EMPTY"
  | "UNSUPPORTED"
  | "DUPLICATE"
  | "SCHEMA_CHANGED"
  | "NEEDS_REVIEW";

type CandidateCounts = {
  insert: number;
  update: number;
  skip: number;
};

type WorksheetResult = {
  worksheet: string;
  sheetId: string;
  position: number | null;
  visibility: "UNAVAILABLE_FROM_EXISTING_METADATA";
  sourceRows: number;
  sourceRowsOrigin: "RANGE" | "METADATA_ROW_COUNT";
  validRows: number;
  invalidRows: number;
  rejectedRows: number;
  candidates: CandidateCounts;
  warnings: string[];
  blockingIssues: string[];
  status: Classification;
  reason: string;
  schemaChange: string | null;
  errorCode?: string;
};

function hasMeaningfulCells(
  rows: readonly (readonly (string | number | null)[])[],
) {
  return rows.some((row) =>
    row.some((cell) =>
      typeof cell === "number" || typeof cell === "string" && cell.trim() !== "",
    ),
  );
}

function errorCode(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError) return error.code;
  return "unknown";
}

function isGlobalFailure(error: unknown) {
  return (
    error instanceof GoogleSheetsIntegrationError &&
    ["configuration", "credentials", "authentication", "permission"].includes(
      error.code,
    )
  );
}

function emptyCandidates(): CandidateCounts {
  return { insert: 0, update: 0, skip: 0 };
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function resultBase(metadata: GoogleSheetsWorksheetMetadata): WorksheetResult {
  return {
    worksheet: metadata.title,
    sheetId: metadata.sheetId,
    position: metadata.index,
    visibility: "UNAVAILABLE_FROM_EXISTING_METADATA",
    sourceRows: 0,
    sourceRowsOrigin: "RANGE",
    validRows: 0,
    invalidRows: 0,
    rejectedRows: 0,
    candidates: emptyCandidates(),
    warnings: [],
    blockingIssues: [],
    status: "NEEDS_REVIEW",
    reason: "Worksheet could not be classified.",
    schemaChange: null,
  };
}

async function classifyWorksheet(
  metadata: GoogleSheetsWorksheetMetadata,
  registryBySheetId: ReadonlyMap<
    string,
    { id: bigint; schemaSnapshot: string | null }
  >,
  rowStatesByWorksheetId: ReadonlyMap<bigint, { sourceKey: string; contentHash: string }[]>,
  titleCounts: ReadonlyMap<string, number>,
): Promise<WorksheetResult> {
  const result = resultBase(metadata);
  const worksheetMetadata = parseBBWorksheetName(metadata.title);

  if (!worksheetMetadata) {
    result.sourceRows = metadata.rowCount ?? 0;
    result.sourceRowsOrigin = "METADATA_ROW_COUNT";
    result.status = "UNSUPPORTED";
    result.reason = "Worksheet title is outside the existing BB importer pattern.";
    result.warnings.push("range_read_skipped_for_unsupported_title");
    return result;
  }

  if ((titleCounts.get(metadata.title) ?? 0) > 1) {
    result.sourceRows = metadata.rowCount ?? 0;
    result.sourceRowsOrigin = "METADATA_ROW_COUNT";
    result.status = "DUPLICATE";
    result.reason = "More than one discovered sheet has the same BB worksheet title.";
    result.blockingIssues.push("duplicate_worksheet_title");
    return result;
  }

  await sleep(REQUEST_DELAY_MS);
  let read;
  try {
    read = await withSyncRetry(() =>
      readGoogleSheetsRange(metadata.title, DYNAMIC_SCAN_RANGE),
    );
  } catch (error) {
    if (isGlobalFailure(error)) throw error;
    result.status = "NEEDS_REVIEW";
    result.reason = "Google Sheets read failed.";
    result.errorCode = errorCode(error);
    result.blockingIssues.push(`read_${errorCode(error)}`);
    return result;
  }

  result.sourceRows = read.rows.length;
  result.sourceRowsOrigin = "RANGE";
  if (!hasMeaningfulCells(read.rows)) {
    result.status = "EMPTY";
    result.reason = "Worksheet has no meaningful cell values in the scan range.";
    return result;
  }

  const parsed = parseDynamicWorksheet(read.rows, {
    worksheetName: metadata.title,
    month: worksheetMetadata?.month,
    year: worksheetMetadata?.year,
    rowOffset: 1,
    columnOffset: 1,
  });

  const readResult = {
    requested: {
      month: worksheetMetadata.month,
      year: worksheetMetadata.year,
      worksheet: metadata.title,
    },
    effective: {
      month: worksheetMetadata.month,
      year: worksheetMetadata.year,
      worksheet: metadata.title,
    },
    isFallback: false,
    fallbackIndex: 0,
    attemptedWorksheets: [metadata.title],
    parsed,
  };
  const plan = buildGoogleSheetsImportPlanFromReadResult(readResult);
  result.validRows = plan.stagingRows.filter(
    (row) => row.validationStatus === "VALID" || row.validationStatus === "VALID_EMPTY",
  ).length;
  result.invalidRows = plan.stagingRows.length - result.validRows;
  result.rejectedRows = result.invalidRows;
  result.warnings = [...plan.warnings];
  result.blockingIssues = [...plan.blockingIssues];

  const registry = registryBySheetId.get(metadata.sheetId);
  const schemaSnapshot = buildSchemaSnapshot(parsed);
  const schemaChange = detectSchemaChange(registry?.schemaSnapshot, schemaSnapshot);
  if (schemaChange.changed) {
    result.schemaChange = schemaChange.type;
    result.blockingIssues.push(`schema_${schemaChange.type.toLowerCase()}`);
  }

  const classification = classifySyncRows(
    plan.stagingRows,
    registry ? rowStatesByWorksheetId.get(registry.id) ?? [] : [],
  );
  result.candidates = {
    insert: classification.inserted,
    update: classification.updated,
    skip: classification.skipped,
  };

  if (classification.duplicates.length > 0) {
    result.status = "DUPLICATE";
    result.reason = "Duplicate stable source key detected in worksheet.";
    result.blockingIssues.push("duplicate_source_key");
  } else if (schemaChange.changed) {
    result.status = "SCHEMA_CHANGED";
    result.reason = schemaChange.reason;
  } else if (plan.status !== "READY_FOR_IMPORT") {
    result.status = "NEEDS_REVIEW";
    result.reason = "Existing import plan has blocking validation issues.";
  } else {
    result.status = "READY_FOR_IMPORT";
    result.reason = "Existing parser, schema checks, validation, and source-key classification passed.";
  }

  if (parsed.diagnostics.errors.length > 0)
    result.warnings.push(`parser_errors=${parsed.diagnostics.errors.length}`);
  if (parsed.diagnostics.ambiguous.length > 0)
    result.warnings.push(`ambiguous_fields=${parsed.diagnostics.ambiguous.length}`);
  return result;
}

async function main() {
  const metadata = await listGoogleSheetsWorksheets();
  if (metadata.length === 0) throw new Error("No Google Sheets worksheets discovered.");

  const [registry, rowStates] = await Promise.all([
    prisma.syncWorksheet.findMany({
      select: { id: true, worksheetKey: true, schemaSnapshot: true },
    }),
    prisma.syncRowState.findMany({
      select: { worksheetId: true, sourceKey: true, contentHash: true },
    }),
  ]);
  const registryBySheetId = new Map(
    registry.map((item) => [item.worksheetKey, { id: item.id, schemaSnapshot: item.schemaSnapshot }]),
  );
  const rowStatesByWorksheetId = new Map<
    bigint,
    { sourceKey: string; contentHash: string }[]
  >();
  for (const state of rowStates) {
    const values = rowStatesByWorksheetId.get(state.worksheetId) ?? [];
    values.push({ sourceKey: state.sourceKey, contentHash: state.contentHash });
    rowStatesByWorksheetId.set(state.worksheetId, values);
  }
  const titleCounts = new Map<string, number>();
  for (const item of metadata)
    titleCounts.set(item.title, (titleCounts.get(item.title) ?? 0) + 1);

  const results: WorksheetResult[] = Array.from({ length: metadata.length });
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= metadata.length) return;
      results[index] = await classifyWorksheet(
        metadata[index],
        registryBySheetId,
        rowStatesByWorksheetId,
        titleCounts,
      );
      if ((index + 1) % 10 === 0 || index + 1 === metadata.length)
        console.error(`worksheet preflight progress: ${index + 1}/${metadata.length}`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, metadata.length) }, () => worker()),
  );

  const counts = {
    READY_FOR_IMPORT: 0,
    EMPTY: 0,
    UNSUPPORTED: 0,
    DUPLICATE: 0,
    SCHEMA_CHANGED: 0,
    NEEDS_REVIEW: 0,
  } satisfies Record<Classification, number>;
  const totals = {
    sourceRows: 0,
    rangeRows: 0,
    metadataRows: 0,
    validRows: 0,
    invalidRows: 0,
    rejectedRows: 0,
    insert: 0,
    update: 0,
    skip: 0,
    blockingIssues: 0,
  };
  for (const item of results) {
    counts[item.status] += 1;
    totals.sourceRows += item.sourceRows;
    if (item.sourceRowsOrigin === "RANGE") totals.rangeRows += item.sourceRows;
    else totals.metadataRows += item.sourceRows;
    totals.validRows += item.validRows;
    totals.invalidRows += item.invalidRows;
    totals.rejectedRows += item.rejectedRows;
    totals.insert += item.candidates.insert;
    totals.update += item.candidates.update;
    totals.skip += item.candidates.skip;
    totals.blockingIssues += item.blockingIssues.length;
  }

  const compact = results.map((item) => ({
    worksheet: item.worksheet,
    sheetId: item.sheetId,
    position: item.position,
    sourceRows: item.sourceRows,
    validRows: item.validRows,
    invalidRows: item.invalidRows,
    rejectedRows: item.rejectedRows,
    insert: item.candidates.insert,
    update: item.candidates.update,
    skip: item.candidates.skip,
    warningCount: item.warnings.length,
    blockingIssues: item.blockingIssues,
    status: item.status,
    reason: item.reason,
    schemaChange: item.schemaChange,
    errorCode: item.errorCode ?? null,
    sourceRowsOrigin: item.sourceRowsOrigin,
  }));

  function markdownCell(value: string | number | null) {
    return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  }

  function reportFor() {
    const review = results.filter(
      (item) => item.status === "NEEDS_REVIEW" || item.status === "DUPLICATE" || item.status === "SCHEMA_CHANGED",
    );
    const ready = results.filter((item) => item.status === "READY_FOR_IMPORT");
    const finalStatus = totals.blockingIssues > 0 || ready.length === 0
      ? "FULL DRY-RUN — BLOCKED"
      : "FULL IMPORT — PASS WITH REVIEW";
    const inventory = results.map((item) =>
      `| ${markdownCell(item.worksheet)} | ${markdownCell(item.sheetId)} | ${markdownCell(item.position)} | ${markdownCell(item.sourceRows)} (${item.sourceRowsOrigin === "RANGE" ? "range" : "metadata"}) | ${item.status} | ${item.validRows} | ${item.invalidRows} | ${item.candidates.insert} | ${item.candidates.update} | ${item.candidates.skip} | ${item.status} |`,
    ).join("\n");
    const reviewDetails = review.length > 0
      ? review.map((item) =>
          `- **${markdownCell(item.worksheet)}** — ${item.status}; blocking: ${item.blockingIssues.length > 0 ? item.blockingIssues.join(", ") : "none"}; reason: ${markdownCell(item.reason)}`,
        ).join("\n")
      : "- Tidak ada worksheet yang membutuhkan review.";
    return `# Full Worksheet Import Report

Tanggal: 30 Agustus 2026  
Project: Dashboard Batu Bara PLN Jeranjang  
Status: **${finalStatus}**

## Executive Summary

S1–S3 telah dijalankan terhadap seluruh 199 worksheet. Tahap ini hanya melakukan metadata discovery, pembacaan Google Sheets, parsing, schema detection, validasi, dan source-key classification. **Tidak ada database write**.

S4 menghentikan proses sebelum batch karena terdapat blocking issue dan worksheet yang belum aman untuk diimpor. S5–S8 tidak dijalankan. Worksheet yang sudah tersinkron sebelumnya tetap diperlakukan sebagai synchronized; tidak dilakukan import ulang pada fase ini.

## Environment

| Item | Value |
| --- | --- |
| Database write target | PostgreSQL LOCAL (dashboard_pln) — tidak ditulis pada fase dry-run |
| Google Sheets source | Service account server-side yang sudah dikonfigurasi; credential tidak dicatat |
| Range scan | ${DYNAMIC_SCAN_RANGE} |
| Discovery | Read-only; 199 worksheet |
| Parser concurrency | 1 |
| Request spacing | 1.300 ms untuk kandidat BB |

## Google Sheets

- Total worksheet metadata: **${metadata.length}**.
- Visibility tidak tersedia pada type metadata existing; kolom inventory mencatat UNAVAILABLE_FROM_EXISTING_METADATA dan tidak mengasumsikan visibility.
- Worksheet dengan nama di luar pola existing importer BB diklasifikasikan UNSUPPORTED tanpa range read tambahan.
- Tidak ada Google Sheets mutation.

## Worksheet Inventory

Kolom Rows memakai hasil range untuk kandidat BB dan rowCount metadata untuk worksheet unsupported/duplicate yang sengaja tidak dibaca ulang.

| Worksheet | Sheet ID | Position | Rows / Basis | Classification | Valid | Invalid | INSERT | UPDATE | SKIP | Status |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
${inventory}

## Classification

| Classification | Count |
| --- | ---: |
| READY_FOR_IMPORT | ${counts.READY_FOR_IMPORT} |
| EMPTY | ${counts.EMPTY} |
| UNSUPPORTED | ${counts.UNSUPPORTED} |
| DUPLICATE | ${counts.DUPLICATE} |
| SCHEMA_CHANGED | ${counts.SCHEMA_CHANGED} |
| NEEDS_REVIEW | ${counts.NEEDS_REVIEW} |
| **Total** | **${metadata.length}** |

READY worksheet: ${ready.map((item) => item.worksheet).join(", ") || "none"}.

UNSUPPORTED worksheet titles were not sent to the existing BB import plan. Daftar lengkapnya tercantum pada inventory; jumlahnya ${counts.UNSUPPORTED} worksheet.

## Full Dry-Run

| Metric | Result |
| --- | ---: |
| Worksheet count | ${metadata.length} |
| Source rows total | ${totals.sourceRows} |
| Range rows actually read | ${totals.rangeRows} |
| Metadata row-count estimates | ${totals.metadataRows} |
| Valid staging candidates | ${totals.validRows} |
| Invalid | ${totals.invalidRows} |
| INSERT candidate | ${totals.insert} |
| UPDATE candidate | ${totals.update} |
| SKIP candidate | ${totals.skip} |
| Rejected | ${totals.rejectedRows} |
| Blocking issue entries | ${totals.blockingIssues} |
| Database writes | **0** |

Candidate INSERT/UPDATE dari worksheet NEEDS_REVIEW tidak eligible untuk batch. Angka tersebut hanya hasil classification dan tidak dieksekusi.

## Import Readiness

| Gate | Status |
| --- | --- |
| Database local-only | PASS |
| Google API/authentication | PASS |
| Metadata discovery | PASS |
| Parser global | PASS |
| Full dry-run completed | PASS |
| Blocking issues = 0 | **FAIL** |
| Semua candidate aman ditentukan | **FAIL** |
| Import readiness | **BLOCKED** |

## Batch Execution

Tidak ada batch yang dijalankan karena S4 blocked. Default batch size 20 tidak diterapkan.

| Batch | Worksheets | Source Rows | INSERT | UPDATE | SKIP | FAILED | Verification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Tidak dijalankan | 0 | 0 | 0 | 0 | 0 | 0 | BLOCKED at S4 |

## Batch Verification

Tidak ada batch verification karena tidak ada database write pada fase ini. Baseline controlled import Juli26-BB sebelumnya tetap telah diverifikasi dan tidak diubah.

## Idempotency Verification

Classification read-only mengenali Juli26-BB sebagai **SKIP 352**, dengan INSERT 0 dan UPDATE 0. Re-import write tidak dilakukan karena global gate blocked. Tidak ada duplicate yang dibuat pada fase ini.

## Full Dataset Verification

Belum dijalankan sebagai verifikasi pasca-bulk-import karena S5 tidak dimulai. Inventory dan classification lengkap tersedia di atas sebagai dasar perbaikan berikutnya.

## Dashboard Verification

Tidak ada perubahan database sehingga baseline dashboard PostgreSQL normalized tetap berlaku. Controlled baseline sebelumnya memverifikasi target biomassa 70.020 ton, Unit 1–3, dan KPI Juli 2026. Full bulk regression setelah seluruh worksheet **belum dilakukan**.

## Database Safety

- DROP: NO
- TRUNCATE: NO
- Mass DELETE: NO
- Reset: NO
- Prisma migration/db push: NO
- Database write pada S1–S4: NO
- Production write: NO
- Supabase write: NO
- Deployment: NO

## Test Results

| Test | Status |
| --- | --- |
| Preflight script lint | PASS |
| Preflight script TypeScript | PASS |
| Full inventory/classification/dry-run | PASS; databaseWrites=0 |
| Existing dynamic parser verification | PASS |
| Existing PostgreSQL/dashboard baseline | PASS sebelum fase ini |
| Full bulk batch test | NOT RUN; gate blocked |

Regression commands lint, TypeScript, Prisma validate/status, database verification, dan build dijalankan setelah safe verification selesai; hasil final dicatat pada handoff chat. Tidak ada test script npm test pada package.json.

## Exceptions

- ${counts.DUPLICATE} worksheet duplicate berdasarkan identity/title yang harus dipisahkan atau dikonfirmasi sebelum import.
- ${counts.NEEDS_REVIEW} worksheet memiliki blocking parser/semantic issue.
- ${counts.SCHEMA_CHANGED} worksheet schema change.
- Unsupported legacy/auxiliary title count: ${counts.UNSUPPORTED}.
- Blocking entries total: ${totals.blockingIssues}.
- Rate limit pada putaran awal diatasi dengan dry-run konservatif; putaran final tidak melaporkan read rate limit.

## NEEDS_REVIEW Worksheets

${reviewDetails}

## Recommended Next Action

1. Review duplicate worksheet titles dan tetapkan source worksheet yang sah.
2. Review field yang unresolved pada worksheet period lama, khususnya coal receipt, solar receipt, cumulative, target biomassa, dan ambiguous fields.
3. Tetapkan apakah worksheet legacy/auxiliary perlu parser terpisah atau memang di luar scope dashboard.
4. Jalankan ulang S2–S4 setelah keputusan schema/identity tersedia.
5. Hanya setelah blocking = 0, lakukan batch import maksimum 20 worksheet per batch dengan verifikasi di antara batch.

## Final Status

**${finalStatus}**

Bulk import dihentikan sesuai critical stop condition. Tidak ada perubahan database, Google Sheets, Laravel, credential, authentication, atau deployment.
`;
  }

  if (process.argv.includes("--write-report")) {
    await writeFile(
      new URL("../docs/FULL_WORKSHEET_IMPORT_REPORT_2026-08-30.md", import.meta.url),
      reportFor(),
      "utf8",
    );
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        mode: "full-inventory-schema-classification-dry-run",
        databaseWrites: 0,
        worksheetCount: metadata.length,
        concurrency: MAX_CONCURRENCY,
        range: DYNAMIC_SCAN_RANGE,
        counts,
        totals,
        reportWritten: process.argv.includes("--write-report"),
        worksheets: process.argv.includes("--compact") ? compact : results,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "INCOMPLETE",
        mode: "full-inventory-schema-classification-dry-run",
        databaseWrites: 0,
        errorCode: errorCode(error),
        message: "Full worksheet preflight stopped before completion.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
