import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

function usage(message) {
  if (message) console.error(`ADMIN CREATE ERROR: ${message}`);
  console.error(
    'Usage: npm run admin:create -- --email "admin@example.com" --password "<operator-supplied-password>" --name "Administrator"',
  );
  process.exitCode = 2;
}

function parseArguments(argumentsList) {
  const values = {};
  const allowed = new Set(["email", "password", "name"]);

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) return usage(`unexpected argument: ${argument}`);

    const separator = argument.indexOf("=");
    const name = separator === -1
      ? argument.slice(2)
      : argument.slice(2, separator);
    const inlineValue = separator === -1 ? undefined : argument.slice(separator + 1);

    if (!allowed.has(name)) return usage(`unsupported option: --${name}`);
    const value = inlineValue ?? argumentsList[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value || value.startsWith("--")) return usage(`missing value for --${name}`);
    if (values[name] !== undefined) return usage(`duplicate option: --${name}`);
    values[name] = value;
  }

  return values;
}

function normalizeAuthEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidAuthEmail(value) {
  const normalized = value.trim();
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

function safeTargetShape(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isSupabase = hostname.includes("supabase.co") || hostname.includes("supabase.com");
  const isPooler = parsed.port === "6543" || hostname.includes("pooler");
  const pgbouncer = parsed.searchParams.get("pgbouncer") === "true";

  return {
    protocol: parsed.protocol,
    port: parsed.port || "default",
    isSupabase,
    isPooler,
    pgbouncer,
    sslmode: parsed.searchParams.get("sslmode") || "unset",
  };
}

function safeError(error) {
  return {
    errorClass: error?.constructor?.name || "Error",
    code: typeof error?.code === "string" ? error.code : null,
  };
}

const input = parseArguments(process.argv.slice(2));
if (!input || process.exitCode) process.exit(process.exitCode ?? 2);

if (["email", "password", "name"].some((key) => typeof input[key] !== "string")) {
  usage("email, password, and name are required");
  process.exit(process.exitCode ?? 2);
}

const email = normalizeAuthEmail(input.email);
const name = input.name.trim();
const password = input.password;

if (!isValidAuthEmail(email)) usage("email is invalid");
if (email.length === 0 || name.length === 0) usage("email, password, and name are required");
if (name.length > 255) usage("name is too long");
if (password.length < 12) usage("password must contain at least 12 characters");
if (process.exitCode) process.exit(process.exitCode);

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("ADMIN CREATE BLOCKED: DATABASE_URL is not configured.");
  process.exitCode = 1;
} else {
  const target = safeTargetShape(databaseUrl);
  if (!target || target.protocol !== "postgresql:") {
    console.error("ADMIN CREATE BLOCKED: DATABASE_URL is not a PostgreSQL URL.");
    process.exitCode = 1;
  } else if (!target.isSupabase) {
    console.error("ADMIN CREATE BLOCKED: DATABASE_URL does not identify a Supabase endpoint.");
    process.exitCode = 1;
  } else if (target.isPooler && !target.pgbouncer) {
    console.error("ADMIN CREATE BLOCKED: pooler DATABASE_URL must include pgbouncer=true as a separate query parameter.");
    process.exitCode = 1;
  } else if (!target.sslmode || target.sslmode === "disable") {
    console.error("ADMIN CREATE BLOCKED: DATABASE_URL must use SSL.");
    process.exitCode = 1;
  }
}

let prisma;
if (!process.exitCode) {
  prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
  });
}

try {
  if (process.exitCode) process.exit(process.exitCode);

  const metadata = await prisma.$queryRaw`
    SELECT current_schema() AS current_schema
  `;
  if (metadata[0]?.current_schema !== "public") {
    console.error("ADMIN CREATE BLOCKED: connected schema is not public.");
    process.exitCode = 1;
  } else {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { email: true },
    });

    if (existingUser) {
      console.error("ADMIN NOT CREATED: a user with this email already exists; no fields were changed.");
      process.exitCode = 3;
    } else {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const now = new Date();
      await prisma.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          role: "admin",
          createdAt: now,
          updatedAt: now,
        },
        select: { email: true, role: true },
      });

      console.log(JSON.stringify({
        status: "PASS",
        adminCreated: true,
        email,
        role: "admin",
        databaseWrites: 1,
      }, null, 2));
    }
  }
} catch (error) {
  console.error("ADMIN CREATE FAILED:", JSON.stringify(safeError(error)));
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect().catch(() => undefined);
}
