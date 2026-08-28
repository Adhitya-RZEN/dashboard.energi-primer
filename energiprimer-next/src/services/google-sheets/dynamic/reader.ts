import "server-only";

import { readGoogleSheetsRange } from "../../../lib/google-sheets";
import { parseDynamicWorksheet } from "./parser";
import { previousValidBBWorksheets, resolveBBWorksheet } from "./worksheet-resolver";
import type { DynamicParserResult } from "./types";

export const DYNAMIC_SCAN_RANGE = "A1:ZZ500";

export type DynamicWorksheetQuery = {
  month: number;
  year: number;
};

export type DynamicWorksheetReadResult = {
  requested: { month: number; year: number; worksheet: string };
  effective: { month: number; year: number; worksheet: string };
  isFallback: boolean;
  fallbackIndex: number;
  attemptedWorksheets: readonly string[];
  parsed: DynamicParserResult;
};

export async function readAndParseDynamicBBWorksheet(
  query: DynamicWorksheetQuery,
  range = DYNAMIC_SCAN_RANGE,
): Promise<DynamicWorksheetReadResult> {
  const requested = resolveBBWorksheet(query.month, query.year);
  if (!requested) throw new Error("Requested BB worksheet period is invalid.");
  const candidates = [requested, ...previousValidBBWorksheets(query.month, query.year, 12)];
  const attemptedWorksheets: string[] = [];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    attemptedWorksheets.push(candidate.name);
    try {
      const result = await readGoogleSheetsRange(candidate.name, range);
      if (result.rows.length === 0) continue;
      return {
        requested: { month: requested.month, year: requested.year, worksheet: requested.name },
        effective: { month: candidate.month, year: candidate.year, worksheet: candidate.name },
        isFallback: candidate.isFallback,
        fallbackIndex: candidate.fallbackIndex,
        attemptedWorksheets,
        parsed: parseDynamicWorksheet(result.rows, { worksheetName: candidate.name, rowOffset: 1, columnOffset: 1 }),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("No valid BB worksheet returned data within the fallback window.");
}
