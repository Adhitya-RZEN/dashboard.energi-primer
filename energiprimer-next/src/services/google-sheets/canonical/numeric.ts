export type CanonicalNumericStatus =
  | "VALID"
  | "VALID_EMPTY"
  | "AMBIGUOUS"
  | "REJECTED";

export type CanonicalNumericResult = {
  status: CanonicalNumericStatus;
  value: number | null;
  rawDisplayValue: string | null;
  reason: string | null;
};

export type CanonicalNumericOptions = {
  locale?: "ID" | "EN";
};

const EMPTY_MARKERS = new Set(["", "-", "–", "—", "N/A", "NA", "NULL"]);

function valid(value: number, rawDisplayValue: string) {
  return {
    status: "VALID" as const,
    value,
    rawDisplayValue,
    reason: null,
  };
}

function ambiguous(rawDisplayValue: string) {
  return {
    status: "AMBIGUOUS" as const,
    value: null,
    rawDisplayValue,
    reason: "A single separator with three trailing digits needs an approved numeric locale.",
  };
}

export function parseCanonicalNumericValue(
  raw: unknown,
  options: CanonicalNumericOptions = {},
): CanonicalNumericResult {
  if (raw === null || raw === undefined) {
    return {
      status: "VALID_EMPTY",
      value: null,
      rawDisplayValue: null,
      reason: null,
    };
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw)
      ? valid(raw, String(raw))
      : {
          status: "REJECTED",
          value: null,
          rawDisplayValue: String(raw),
          reason: "Numeric value is not finite.",
        };
  }

  const rawDisplayValue = String(raw);
  let text = rawDisplayValue.normalize("NFKC").replace(/[\s\u00a0\u2007\u202f]/g, "").trim();
  if (EMPTY_MARKERS.has(text.toUpperCase())) {
    return {
      status: "VALID_EMPTY",
      value: null,
      rawDisplayValue,
      reason: null,
    };
  }
  if (text.endsWith("%")) {
    return {
      status: "REJECTED",
      value: null,
      rawDisplayValue,
      reason: "Percentage values are not valid for a quantity field.",
    };
  }
  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (!/^[+-]?[\d.,]+$/u.test(text)) {
    return {
      status: "REJECTED",
      value: null,
      rawDisplayValue,
      reason: "Numeric display value is malformed.",
    };
  }

  const commaCount = (text.match(/,/g) ?? []).length;
  const dotCount = (text.match(/\./g) ?? []).length;
  let normalized = text;
  if (commaCount > 0 && dotCount > 0) {
    normalized = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (commaCount + dotCount === 1) {
    const separator = commaCount === 1 ? "," : ".";
    const [, fraction = ""] = text.split(separator);
    if (fraction.length === 3 && !options.locale) return ambiguous(rawDisplayValue);
    const grouped = fraction.length === 3 && options.locale === "EN" && separator === ",";
    const indonesianGrouped = fraction.length === 3 && options.locale === "ID" && separator === ".";
    if (grouped || indonesianGrouped) normalized = text.replace(separator, "");
    else normalized = text.replace(separator, ".");
  } else if (commaCount > 1 || dotCount > 1) {
    const separator = commaCount > 1 ? "," : ".";
    const parts = text.split(separator);
    if (parts.some((part, index) => index > 0 && part.length !== 3)) {
      return {
        status: "REJECTED",
        value: null,
        rawDisplayValue,
        reason: "Grouped numeric value has an invalid group width.",
      };
    }
    normalized = text.replaceAll(separator, "");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return {
      status: "REJECTED",
      value: null,
      rawDisplayValue,
      reason: "Numeric display value is not finite.",
    };
  }
  return valid(negative ? -value : value, rawDisplayValue);
}
