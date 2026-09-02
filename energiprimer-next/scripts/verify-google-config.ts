import {
  getGoogleSheetsConfig,
  isGoogleSheetsConfigComplete,
} from "../src/lib/google-sheets";

const keys = [
  "GOOGLE_SHEETS_CREDENTIALS_PATH",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
] as const;
const original = new Map(keys.map((key) => [key, process.env[key]]));

try {
  delete process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@example.test";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY =
    "phase-19-fixture-private-key-placeholder";
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "spreadsheet-placeholder";
  if (!isGoogleSheetsConfigComplete())
    throw new Error("Environment service-account pair was not recognized by the canonical check.");
  const config = getGoogleSheetsConfig();
  if (!config.serviceAccountEmail || !config.serviceAccountPrivateKey)
    throw new Error("Environment service-account pair was not accepted.");

  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  let rejectedPartial = false;
  try {
    getGoogleSheetsConfig();
  } catch {
    rejectedPartial = true;
  }
  if (!rejectedPartial)
    throw new Error("Partial environment service-account config was accepted.");

  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  process.env.GOOGLE_SHEETS_CREDENTIALS_PATH = "./credentials/fixture.json";
  if (!isGoogleSheetsConfigComplete())
    throw new Error("Credential-file configuration was not recognized by the canonical check.");
  const fileConfig = getGoogleSheetsConfig();
  if (!fileConfig.credentialsPath)
    throw new Error("Credential-file configuration was not accepted.");
} finally {
  for (const key of keys) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      checks: [
        "canonical check recognizes the server-side service-account environment pair",
        "partial service-account environment configuration is rejected",
        "canonical check recognizes credential-file configuration",
        "credential values are not printed",
      ],
    },
    null,
    2,
  ),
);
