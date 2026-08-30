import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import "server-only";

// This module imports Node-only APIs and must remain reachable only from server code.

export type GoogleSheetCell = string | number | null;
export type GoogleSheetRow = GoogleSheetCell[];

export type GoogleSheetsConfig = {
  credentialsPath?: string;
  serviceAccountEmail?: string;
  serviceAccountPrivateKey?: string;
  spreadsheetId: string;
  cacheTtlSeconds: number;
};

export type GoogleSheetsReadResult = {
  worksheet: string;
  range: string;
  rows: GoogleSheetRow[];
};

export type GoogleSheetsWorksheetMetadata = {
  sheetId: string;
  title: string;
  index: number | null;
  sheetType: string | null;
  rowCount: number | null;
  columnCount: number | null;
};

export type GoogleSheetsErrorCode =
  | "configuration"
  | "credentials"
  | "authentication"
  | "permission"
  | "rate_limit"
  | "timeout"
  | "api"
  | "malformed_response";

export class GoogleSheetsIntegrationError extends Error {
  readonly code: GoogleSheetsErrorCode;
  readonly status: number | undefined;
  readonly worksheet: string | undefined;

  constructor(
    code: GoogleSheetsErrorCode,
    message: string,
    options?: { status?: number; worksheet?: string },
  ) {
    super(message);
    this.name = "GoogleSheetsIntegrationError";
    this.code = code;
    this.status = options?.status;
    this.worksheet = options?.worksheet;
  }
}

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const REQUEST_TIMEOUT_MS = 15_000;

let accessToken: { value: string; expiresAt: number } | null = null;
const rangeCache = new Map<
  string,
  { expiresAt: number; result: GoogleSheetsReadResult }
>();
const worksheetMetadataCache = new Map<
  string,
  { expiresAt: number; result: GoogleSheetsWorksheetMetadata[] }
>();

export function getGoogleSheetsConfig(): GoogleSheetsConfig {
  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH?.trim();
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const serviceAccountPrivateKey =
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const configuredTtl = Number(process.env.GOOGLE_SHEETS_CACHE_TTL ?? "120");

  const hasFileCredentials = Boolean(credentialsPath);
  const hasEnvironmentCredentials = Boolean(
    serviceAccountEmail && serviceAccountPrivateKey,
  );
  const hasPartialEnvironmentCredentials = Boolean(
    serviceAccountEmail || serviceAccountPrivateKey,
  );
  if (
    (!hasFileCredentials && !hasEnvironmentCredentials) ||
    hasPartialEnvironmentCredentials && !hasEnvironmentCredentials ||
    !spreadsheetId
  ) {
    throw new GoogleSheetsIntegrationError(
      "configuration",
      "Google Sheets configuration is incomplete.",
    );
  }

  if (!Number.isFinite(configuredTtl) || configuredTtl < 0) {
    throw new GoogleSheetsIntegrationError(
      "configuration",
      "Google Sheets cache configuration is invalid.",
    );
  }

  return {
    credentialsPath,
    serviceAccountEmail,
    serviceAccountPrivateKey,
    spreadsheetId,
    cacheTtlSeconds: configuredTtl,
  };
}

export function classifyGoogleSheetsStatus(
  status: number,
): GoogleSheetsErrorCode {
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  return "api";
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateServiceAccount(parsed: unknown) {
  if (
    !isRecord(parsed) ||
    typeof parsed.client_email !== "string" ||
    typeof parsed.private_key !== "string"
  ) {
    throw new GoogleSheetsIntegrationError(
      "credentials",
      "Google Sheets credentials are incomplete.",
    );
  }

  const privateKey = normalizePrivateKey(parsed.private_key);
  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
    throw new GoogleSheetsIntegrationError(
      "credentials",
      "Google Sheets private key is invalid.",
    );
  }

  return { client_email: parsed.client_email, private_key: privateKey };
}

async function readServiceAccount(config: GoogleSheetsConfig) {
  if (config.serviceAccountEmail && config.serviceAccountPrivateKey)
    return validateServiceAccount({
      client_email: config.serviceAccountEmail,
      private_key: config.serviceAccountPrivateKey,
    });

  if (!config.credentialsPath)
    throw new GoogleSheetsIntegrationError(
      "credentials",
      "Google Sheets credentials are unavailable.",
    );
  let raw: string;
  try {
    raw = await readFile(config.credentialsPath, "utf8");
  } catch {
    throw new GoogleSheetsIntegrationError(
      "credentials",
      "Google Sheets credentials could not be read.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GoogleSheetsIntegrationError(
      "credentials",
      "Google Sheets credentials are not valid JSON.",
    );
  }
  return validateServiceAccount(parsed);
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GoogleSheetsIntegrationError(
        "timeout",
        "Google Sheets request timed out.",
      );
    }
    throw new GoogleSheetsIntegrationError(
      "api",
      "Google Sheets request could not be completed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken(credentials: {
  client_email: string;
  private_key: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  if (accessToken && accessToken.expiresAt > now + 60) return accessToken.value;

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;

  let assertion: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    assertion = `${unsigned}.${signer.sign(credentials.private_key, "base64url")}`;
  } catch {
    throw new GoogleSheetsIntegrationError(
      "credentials",
      "Google Sheets private key could not sign the request.",
    );
  }

  const response = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const code = classifyGoogleSheetsStatus(response.status);
    if (code === "authentication" || code === "permission") accessToken = null;
    throw new GoogleSheetsIntegrationError(
      code,
      "Google Sheets authentication failed.",
      { status: response.status },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GoogleSheetsIntegrationError(
      "authentication",
      "Google Sheets authentication response is invalid.",
    );
  }

  if (!isRecord(body) || typeof body.access_token !== "string") {
    throw new GoogleSheetsIntegrationError(
      "authentication",
      "Google Sheets authentication response is incomplete.",
    );
  }

  const expiresIn =
    typeof body.expires_in === "number" ? body.expires_in : 3600;
  accessToken = { value: body.access_token, expiresAt: now + expiresIn };
  return accessToken.value;
}

export async function readGoogleSheetsRange(
  worksheet: string,
  range: string,
): Promise<GoogleSheetsReadResult> {
  const config = getGoogleSheetsConfig();
  const cacheKey = `${config.spreadsheetId}:${worksheet}:${range}`;
  const cached = rangeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (cached) rangeCache.delete(cacheKey);

  const credentials = await readServiceAccount(config);
  const token = await getAccessToken(credentials);
  const a1Range = encodeURIComponent(`'${worksheet}'!${range}`);
  const url = `${SHEETS_API_URL}/${encodeURIComponent(config.spreadsheetId)}/values/${a1Range}`;

  const response = await fetchWithTimeout(url, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const code = classifyGoogleSheetsStatus(response.status);
    if (code === "authentication") accessToken = null;
    throw new GoogleSheetsIntegrationError(
      code,
      "Google Sheets data request failed.",
      {
        status: response.status,
        worksheet,
      },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GoogleSheetsIntegrationError(
      "malformed_response",
      "Google Sheets data response is invalid.",
      { worksheet },
    );
  }

  if (!isRecord(body) || body.values === undefined) {
    const result = { worksheet, range, rows: [] };
    if (config.cacheTtlSeconds > 0)
      rangeCache.set(cacheKey, {
        expiresAt: Date.now() + config.cacheTtlSeconds * 1000,
        result,
      });
    return result;
  }

  if (
    !Array.isArray(body.values) ||
    body.values.some(
      (row) =>
        !Array.isArray(row) ||
        row.some(
          (cell) =>
            cell !== null &&
            typeof cell !== "string" &&
            typeof cell !== "number",
        ),
    )
  ) {
    throw new GoogleSheetsIntegrationError(
      "malformed_response",
      "Google Sheets data response has an invalid row shape.",
      { worksheet },
    );
  }

  const result = { worksheet, range, rows: body.values as GoogleSheetRow[] };
  if (config.cacheTtlSeconds > 0)
    rangeCache.set(cacheKey, {
      expiresAt: Date.now() + config.cacheTtlSeconds * 1000,
      result,
    });
  return result;
}

/**
 * Reads spreadsheet metadata without downloading cell values. The sheet ID is
 * the stable identity used by the synchronization registry; title is treated
 * as mutable display metadata.
 */
export async function listGoogleSheetsWorksheets(): Promise<
  GoogleSheetsWorksheetMetadata[]
> {
  const config = getGoogleSheetsConfig();
  const cacheKey = config.spreadsheetId;
  const cached = worksheetMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (cached) worksheetMetadataCache.delete(cacheKey);

  const credentials = await readServiceAccount(config);
  const token = await getAccessToken(credentials);
  const fields =
    "sheets(properties(sheetId,title,index,sheetType,gridProperties(rowCount,columnCount)))";
  const url = `${SHEETS_API_URL}/${encodeURIComponent(config.spreadsheetId)}?includeGridData=false&fields=${encodeURIComponent(fields)}`;
  const response = await fetchWithTimeout(url, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const code = classifyGoogleSheetsStatus(response.status);
    if (code === "authentication") accessToken = null;
    throw new GoogleSheetsIntegrationError(
      code,
      "Google Sheets metadata request failed.",
      { status: response.status },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GoogleSheetsIntegrationError(
      "malformed_response",
      "Google Sheets metadata response is invalid.",
    );
  }

  if (!isRecord(body) || body.sheets === undefined) {
    throw new GoogleSheetsIntegrationError(
      "malformed_response",
      "Google Sheets metadata response is incomplete.",
    );
  }

  if (!Array.isArray(body.sheets)) {
    throw new GoogleSheetsIntegrationError(
      "malformed_response",
      "Google Sheets metadata has an invalid worksheet list.",
    );
  }

  const worksheets: GoogleSheetsWorksheetMetadata[] = [];
  for (const sheet of body.sheets) {
    if (!isRecord(sheet) || !isRecord(sheet.properties)) {
      throw new GoogleSheetsIntegrationError(
        "malformed_response",
        "Google Sheets metadata contains an invalid worksheet.",
      );
    }

    const properties = sheet.properties;
    const rawSheetId = properties.sheetId;
    const title = properties.title;
    if (
      (typeof rawSheetId !== "number" && typeof rawSheetId !== "string") ||
      typeof title !== "string" ||
      !title.trim()
    ) {
      throw new GoogleSheetsIntegrationError(
        "malformed_response",
        "Google Sheets worksheet metadata is incomplete.",
      );
    }

    const gridProperties = isRecord(properties.gridProperties)
      ? properties.gridProperties
      : null;
    const numberOrNull = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    worksheets.push({
      sheetId: String(rawSheetId),
      title: title.trim(),
      index: numberOrNull(properties.index),
      sheetType:
        typeof properties.sheetType === "string"
          ? properties.sheetType
          : null,
      rowCount: numberOrNull(gridProperties?.rowCount),
      columnCount: numberOrNull(gridProperties?.columnCount),
    });
  }

  if (config.cacheTtlSeconds > 0) {
    worksheetMetadataCache.set(cacheKey, {
      expiresAt: Date.now() + config.cacheTtlSeconds * 1000,
      result: worksheets,
    });
  }
  return worksheets;
}
