import "server-only";

import { isGoogleSheetsConfigComplete } from "@/lib/google-sheets";

export type ServerEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type EnvironmentCheck = {
  required: string[];
  missing: string[];
  ready: boolean;
};

export type ServerEnvironmentPreflight = {
  startup: EnvironmentCheck;
  googleSync: EnvironmentCheck;
};

function hasValue(environment: ServerEnvironment, name: string) {
  return Boolean(environment[name]?.trim());
}

function check(
  environment: ServerEnvironment,
  required: string[],
): EnvironmentCheck {
  const missing = required.filter((name) => !hasValue(environment, name));
  return { required, missing, ready: missing.length === 0 };
}

export function getServerEnvironmentPreflight(
  environment: ServerEnvironment = process.env,
): ServerEnvironmentPreflight {
  const startup = check(environment, ["DATABASE_URL", "AUTH_SECRET"]);

  const googleSyncRequired = ["DATABASE_URL", "CRON_SECRET"];
  if (!isGoogleSheetsConfigComplete(environment)) {
    googleSyncRequired.push(
      "GOOGLE_SHEETS_CREDENTIALS_PATH or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY + GOOGLE_SHEETS_SPREADSHEET_ID",
    );
  }
  const googleSync = check(environment, googleSyncRequired);
  if (isGoogleSheetsConfigComplete(environment)) {
    googleSync.required = [
      ...googleSync.required,
      "GOOGLE_SHEETS_CREDENTIALS_PATH or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
      "GOOGLE_SHEETS_SPREADSHEET_ID",
    ];
  }

  return { startup, googleSync };
}

export function assertStartupEnvironment(
  environment: ServerEnvironment = process.env,
) {
  const preflight = getServerEnvironmentPreflight(environment);
  if (!preflight.startup.ready) {
    throw new Error(
      `Required server environment is missing: ${preflight.startup.missing.join(", ")}`,
    );
  }
  return preflight;
}
