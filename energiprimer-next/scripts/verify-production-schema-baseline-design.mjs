import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptsDirectory, "..");
const schemaPath = path.join(projectDirectory, "prisma", "schema.prisma");
const artifactPath = path.join(
  projectDirectory,
  "docs",
  "SUPABASE_PRODUCTION_SCHEMA_BASELINE_DESIGN.sql",
);

const schema = fs.readFileSync(schemaPath, "utf8");
const artifact = fs.readFileSync(artifactPath, "utf8");

const modelBlocks = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)];
const tables = modelBlocks.map(([, modelName, body]) => {
  const mappedName = body.match(/@@map\("([^"]+)"\)/)?.[1];
  return mappedName ?? modelName;
});

const expectedMarkers = [
  "PHASE 21C DESIGN ARTIFACT",
  "STATUS: DESIGN-ONLY / NOT DEPLOYABLE",
];
const failures = [];

for (const marker of expectedMarkers) {
  if (!artifact.includes(marker)) failures.push(`missing artifact marker: ${marker}`);
}

if (artifactPath.includes(`${path.sep}prisma${path.sep}migrations${path.sep}`)) {
  failures.push("design artifact must not be inside prisma/migrations");
}

for (const table of tables) {
  if (!artifact.includes(`CREATE TABLE "${table}"`)) {
    failures.push(`missing CREATE TABLE for Prisma model table: ${table}`);
  }
}

const createTableCount = (artifact.match(/^CREATE TABLE /gm) ?? []).length;
const createIndexCount = (artifact.match(/^CREATE (?:UNIQUE )?INDEX /gm) ?? []).length;
const foreignKeyCount = (artifact.match(/FOREIGN KEY/g) ?? []).length;
const forbiddenOperations =
  /\b(?:DROP\s+(?:TABLE|COLUMN|SCHEMA|INDEX)|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO|CREATE\s+TYPE)\b/i;

if (createTableCount !== tables.length) {
  failures.push(
    `table count mismatch: schema=${tables.length}, artifact=${createTableCount}`,
  );
}

if (foreignKeyCount !== 19) {
  failures.push(`unexpected foreign-key count: ${foreignKeyCount}`);
}

if (artifact.includes("BIOMASS_STOCK")) {
  failures.push("BIOMASS_STOCK must not be introduced by the Prisma baseline");
}

if (forbiddenOperations.test(artifact)) {
  failures.push("artifact contains a forbidden destructive/data operation");
}

const result = {
  status: failures.length === 0 ? "PASS" : "FAIL",
  mode: "static-only; no database connection and no SQL execution",
  schema: path.relative(projectDirectory, schemaPath),
  artifact: path.relative(projectDirectory, artifactPath),
  modelCount: tables.length,
  tableCount: createTableCount,
  indexCount: createIndexCount,
  foreignKeyCount,
  checks: [
    "Every Prisma model table is present in the design artifact",
    "Artifact is outside prisma/migrations",
    "No BIOMASS_STOCK table is introduced",
    "No DROP, TRUNCATE, DELETE, UPDATE, INSERT, or CREATE TYPE operation is present",
  ],
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
