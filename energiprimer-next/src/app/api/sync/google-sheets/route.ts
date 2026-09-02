import { NextResponse } from "next/server";

import { isSyncAllowedEnvironment } from "@/lib/deployment-environment";
import { GoogleSheetsIntegrationError } from "@/lib/google-sheets";
import { runGoogleSheetsIncrementalSync } from "@/services/google-sheets/sync/engine";
import { classifySyncError } from "@/services/google-sheets/sync/error-classification";
import { isAuthorizedCronRequest } from "@/services/google-sheets/sync/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json(
    { status: "UNAUTHORIZED", message: "Synchronization is not authorized." },
    { status: 401 },
  );
}

function disabledForDeploymentEnvironment() {
  return NextResponse.json(
    {
      status: "DISABLED",
      message: "Synchronization is disabled for this deployment environment.",
    },
    { status: 403 },
  );
}

async function handle(request: Request) {
  if (!isSyncAllowedEnvironment()) return disabledForDeploymentEnvironment();

  if (!process.env.CRON_SECRET)
    return NextResponse.json(
      { status: "NOT_CONFIGURED", message: "Synchronization is not configured." },
      { status: 503 },
    );
  if (!isAuthorizedCronRequest(request.headers)) return unauthorized();

  try {
    const result = await runGoogleSheetsIncrementalSync({
      triggerType: "cron",
      // Discovery is broad, but cron admits only valid BB worksheets after
      // Juli26-BB whose period is due and whose schema matches Juli26-BB.
      scope: "automatic",
      // The deployment gate above is the explicit boundary for the route's
      // remote-capable write path. The CLI keeps its local-only guard.
      allowNonLocalDatabase: true,
    });
    return NextResponse.json({
      status: result.status,
      worksheetsScanned: result.worksheetsScanned,
      rowsScanned: result.rowsScanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (error) {
    const safeCategory = error instanceof GoogleSheetsIntegrationError
      ? `google_sheets_${error.code}`
      : `sync_${classifySyncError(error).toLocaleLowerCase("en-US")}`;
    console.error("[google-sheets-sync]", safeCategory);
    return NextResponse.json(
      { status: "FAILED", message: "Synchronization failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
