import {
  detectSchemaChange,
  type SchemaColumnSnapshot,
  type SchemaSnapshot,
} from "../src/services/google-sheets/sync/schema-detection";

function column(
  label: string,
  overrides: Partial<SchemaColumnSnapshot> = {},
): SchemaColumnSnapshot {
  const base = {
    semanticKey: JSON.stringify({
      resource: "biomass",
      unit: "TON",
      unitNumber: null,
      isTotal: false,
      isStock: false,
      isHop: false,
      isDate: false,
    }),
    labels: [label],
    resource: "biomass" as const,
    unit: "TON",
    unitNumber: null,
    isTotal: false,
    isStock: false,
    isHop: false,
    isDate: false,
    valueType: "numeric" as const,
  };
  const value = { ...base, ...overrides };
  return {
    ...value,
    signature: JSON.stringify({
      semanticKey: value.semanticKey,
      labels: value.labels,
      valueType: value.valueType,
    }),
  };
}

function snapshot(columns: readonly SchemaColumnSnapshot[]): SchemaSnapshot {
  const sortedColumns = [...columns].sort((a, b) =>
    a.signature.localeCompare(b.signature),
  );
  return {
    version: 1,
    dateColumnPresent: true,
    columns: sortedColumns,
    hash: JSON.stringify(sortedColumns),
  };
}

const base = snapshot([column("BIOMASSA UNIT 1")]);
const checks: string[] = [];

const initial = detectSchemaChange(null, base);
if (initial.changed || initial.type !== "NEW_SCHEMA")
  throw new Error("Initial schema was not classified as NEW_SCHEMA.");
checks.push("initial schema is accepted as NEW_SCHEMA");

const unchanged = detectSchemaChange(base, base);
if (unchanged.changed || unchanged.type !== "UNCHANGED")
  throw new Error("Identical schema was not classified as UNCHANGED.");
checks.push("identical schema is UNCHANGED");

const reordered = detectSchemaChange(
  snapshot([column("BIOMASSA UNIT 2"), base.columns[0]]),
  snapshot([base.columns[0], column("BIOMASSA UNIT 2")]),
);
if (reordered.changed || reordered.type !== "UNCHANGED")
  throw new Error("Column reorder was incorrectly classified as a schema change.");
checks.push("column reorder is ignored");

const added = detectSchemaChange(
  base,
  snapshot([base.columns[0], column("BIOMASSA UNIT 2")]),
);
if (!added.changed || added.type !== "NEW_COLUMN")
  throw new Error("New column was not classified as NEW_COLUMN.");
checks.push("new column requires review");

const removed = detectSchemaChange(base, snapshot([]));
if (!removed.changed || removed.type !== "MISSING_COLUMN")
  throw new Error("Missing column was not classified as MISSING_COLUMN.");
checks.push("missing column requires review");

const renamed = detectSchemaChange(
  base,
  snapshot([column("BIOMASSA UNIT SATU")]),
);
if (!renamed.changed || renamed.type !== "RENAME_CANDIDATE")
  throw new Error("Renamed column was not classified as RENAME_CANDIDATE.");
checks.push("potential rename requires review");

const typeChanged = detectSchemaChange(
  base,
  snapshot([column("BIOMASSA UNIT 1", { valueType: "text" })]),
);
if (!typeChanged.changed || typeChanged.type !== "TYPE_CHANGE")
  throw new Error("Type change was not classified as TYPE_CHANGE.");
checks.push("value type change requires review");

const ambiguous = detectSchemaChange(
  snapshot([column("ENERGY A"), column("ENERGY B")]),
  snapshot([column("ENERGY C"), column("ENERGY D")]),
);
if (!ambiguous.changed || ambiguous.type !== "SCHEMA_REVIEW")
  throw new Error("Ambiguous rename was not classified as SCHEMA_REVIEW.");
checks.push("ambiguous mapping requires review");

const duplicateHeader = detectSchemaChange(
  base,
  snapshot([base.columns[0], column("BIOMASSA UNIT 1")]),
);
if (!duplicateHeader.changed || duplicateHeader.type !== "SCHEMA_REVIEW")
  throw new Error("Duplicate header was not classified as SCHEMA_REVIEW.");
checks.push("duplicate header requires review");

const emptyHeader = detectSchemaChange(
  base,
  snapshot([base.columns[0], column("", { labels: [] })]),
);
if (!emptyHeader.changed || emptyHeader.type !== "SCHEMA_REVIEW")
  throw new Error("Empty header was not classified as SCHEMA_REVIEW.");
checks.push("empty header requires review");

if (process.argv.includes("--live")) {
  const { prisma } = await import("../src/lib/prisma");
  const { runGoogleSheetsIncrementalSync } = await import(
    "../src/services/google-sheets/sync/engine"
  );
  const { stableGoogleSheetsSourceKey } = await import(
    "../src/services/google-sheets/sync/discovery"
  );
  const result = await runGoogleSheetsIncrementalSync({
    triggerType: "verification",
    worksheetTitle: "Juli26-BB",
  });
  if (result.status !== "SUCCESS")
    throw new Error(`Live schema verification failed: ${result.status}`);
  const sourceKey = stableGoogleSheetsSourceKey(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
  );
  const worksheet = await prisma.syncWorksheet.findFirst({
    where: { source: { sourceKey }, worksheetTitle: "Juli26-BB" },
    select: { schemaHash: true, schemaSnapshot: true, status: true },
  });
  if (!worksheet?.schemaHash || !worksheet.schemaSnapshot)
    throw new Error("Live schema snapshot was not persisted.");
  checks.push("live worksheet schema snapshot persisted");
  await prisma.$disconnect();
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      mode: process.argv.includes("--live") ? "static+live" : "static",
      checks,
    },
    null,
    2,
  ),
);
