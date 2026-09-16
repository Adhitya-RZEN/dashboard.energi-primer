export const phase2LayoutFixtures = [
  { name: "canonical layout", expected: "APPROVED" },
  { name: "reordered columns", expected: "APPROVED_IF_SEMANTIC_PATHS_RESOLVE" },
  { name: "extra columns", expected: "IGNORE_IF_OUTSIDE_CONTRACT" },
  { name: "missing columns", expected: "BLOCK" },
  { name: "duplicate labels", expected: "BLOCK" },
  { name: "legacy layout", expected: "COMPARISON_ONLY_UNLESS_PROFILE_APPROVED" },
] as const;

export const phase2NumericFixtures = [
  { raw: "1250.50", expectedStatus: "VALID", expectedValue: 1250.5 },
  { raw: "1,250.50", expectedStatus: "VALID", expectedValue: 1250.5 },
  { raw: "1.250,50", expectedStatus: "VALID", expectedValue: 1250.5 },
  { raw: "1250,50", expectedStatus: "VALID", expectedValue: 1250.5 },
  { raw: "1.250", expectedStatus: "AMBIGUOUS", expectedValue: null },
  { raw: "1,250", expectedStatus: "AMBIGUOUS", expectedValue: null },
  { raw: "0", expectedStatus: "VALID", expectedValue: 0 },
  { raw: "-12.5", expectedStatus: "VALID", expectedValue: -12.5 },
  { raw: "", expectedStatus: "VALID_EMPTY", expectedValue: null },
  { raw: "N/A", expectedStatus: "VALID_EMPTY", expectedValue: null },
] as const;

export const phase2DateFixtures = [
  { raw: "2026-07-01", expectedStatus: "VALID", expectedValue: "2026-07-01" },
  { raw: "01/07/2026", locale: "ID", expectedStatus: "VALID", expectedValue: "2026-07-01" },
  { raw: "01/02/2026", expectedStatus: "AMBIGUOUS", expectedValue: null },
  { raw: "2026-02-30", expectedStatus: "REJECTED", expectedValue: null },
  { raw: "31", month: 7, year: 2026, expectedStatus: "VALID", expectedValue: "2026-07-31" },
  { raw: "2026-08-01", month: 7, year: 2026, expectedStatus: "REJECTED", expectedValue: null },
] as const;
