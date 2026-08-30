export type ImportValue = number | null;

export type ImportSource = {
  worksheet: string;
  cell: string | null;
  row: number | null;
};

export type BiomassReceiptImportRecord = {
  periodStart: Date;
  supplierCode: string;
  supplierName: string;
  quantityTon: ImportValue;
  source: ImportSource;
};

export type BiomassConsumptionImportRecord = {
  readingDate: Date;
  unitNumber: 1 | 2 | 3;
  quantityTon: ImportValue;
  source: ImportSource;
};

export type CoalConsumptionImportRecord = {
  readingDate: Date;
  unitNumber: 1 | 2 | 3;
  quantityTon: ImportValue;
  source: ImportSource;
};

export type CoalStockImportRecord = {
  readingDate: Date;
  closingStock: ImportValue;
  consumed: ImportValue;
  source: ImportSource;
};

export type CoalReceiptImportRecord = {
  periodStart: Date;
  quantityTon: ImportValue;
  source: ImportSource;
};

export type SolarConsumptionImportRecord = {
  readingDate: Date;
  quantityLiter: ImportValue;
  source: ImportSource;
};

export type SolarReceiptImportRecord = {
  periodStart: Date;
  quantityLiter: ImportValue;
  source: ImportSource;
};

export type HopImportRecord = {
  readingDate: Date;
  unitNumber: 1 | 2 | 3;
  hopDays: ImportValue;
  source: ImportSource;
};

export type BiomassTargetImportRecord = {
  targetYear: number;
  targetTon: number;
  source: ImportSource;
};

export type BiomassCumulativeImportRecord = {
  periodStart: Date;
  cumulativeTon: ImportValue;
  source: ImportSource;
};

export type ImportStagingRecord = {
  entityType: string;
  source: ImportSource;
  periodStart: Date | null;
  readingDate: Date | null;
  unitCode: string | null;
  supplierCode: string | null;
  rawValue: string | null;
  normalizedValue: ImportValue;
  valueUnit: string | null;
  validationStatus: "VALID" | "VALID_EMPTY" | "REJECTED";
  validationMessage: string | null;
};

export type GoogleSheetsImportPlan = {
  requested: { month: number; year: number; worksheet: string };
  effective: { month: number; year: number; worksheet: string };
  sourceRange: string;
  status: "READY_FOR_IMPORT" | "NEEDS_REVIEW";
  blockingIssues: readonly string[];
  warnings: readonly string[];
  requestedPeriod: Date;
  effectivePeriod: Date;
  receiptRows: readonly BiomassReceiptImportRecord[];
  coalReceiptRows: readonly CoalReceiptImportRecord[];
  coalConsumptionRows: readonly CoalConsumptionImportRecord[];
  coalStockRows: readonly CoalStockImportRecord[];
  biomassConsumptionRows: readonly BiomassConsumptionImportRecord[];
  solarConsumptionRows: readonly SolarConsumptionImportRecord[];
  solarReceiptRows: readonly SolarReceiptImportRecord[];
  hopRows: readonly HopImportRecord[];
  targetRows: readonly BiomassTargetImportRecord[];
  cumulativeRows: readonly BiomassCumulativeImportRecord[];
  stagingRows: readonly ImportStagingRecord[];
  summary: {
    dailyRows: number;
    receiptRows: number;
    coalReceiptRows: number;
    coalConsumptionRows: number;
    coalStockRows: number;
    biomassConsumptionRows: number;
    solarConsumptionRows: number;
    solarReceiptRows: number;
    hopRows: number;
    targetRows: number;
    cumulativeRows: number;
    totalRows: number;
  };
};
