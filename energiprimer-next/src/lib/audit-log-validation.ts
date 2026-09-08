import { UserAuditAction } from "@prisma/client";

export const AUDIT_LOG_PAGE_SIZE_DEFAULT = 25;
export const AUDIT_LOG_PAGE_SIZE_MAX = 100;
const AUDIT_LOG_PAGE_MAX = 1_000;
const AUDIT_LOG_SEARCH_MAX_LENGTH = 100;

export const AUDIT_LOG_ACTIONS = [
  UserAuditAction.USER_CREATED,
  UserAuditAction.USER_UPDATED,
  UserAuditAction.PASSWORD_RESET,
  UserAuditAction.ROLE_CHANGED,
  UserAuditAction.USER_ENABLED,
  UserAuditAction.USER_DISABLED,
] as const;

export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

export type AuditLogQuery = {
  page: number;
  pageSize: number;
  action: "ALL" | AuditLogAction;
  search: string;
  from: string;
  to: string;
};

function asSingleQueryValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function parseBoundedInteger(
  value: string,
  fallback: number,
  maximum: number,
) {
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isAuditLogAction(value: string): value is AuditLogAction {
  return (AUDIT_LOG_ACTIONS as readonly string[]).includes(value);
}

export function parseAuditLogQuery(
  params: Readonly<Record<string, string | string[] | undefined>> = {},
): AuditLogQuery {
  const actionValue = asSingleQueryValue(params.action);
  const fromValue = asSingleQueryValue(params.from);
  const toValue = asSingleQueryValue(params.to);
  const search = asSingleQueryValue(params.search).slice(
    0,
    AUDIT_LOG_SEARCH_MAX_LENGTH,
  );

  return {
    page: parseBoundedInteger(
      asSingleQueryValue(params.page),
      1,
      AUDIT_LOG_PAGE_MAX,
    ),
    pageSize: parseBoundedInteger(
      asSingleQueryValue(params.pageSize),
      AUDIT_LOG_PAGE_SIZE_DEFAULT,
      AUDIT_LOG_PAGE_SIZE_MAX,
    ),
    action: isAuditLogAction(actionValue) ? actionValue : "ALL",
    search,
    from: isValidDateOnly(fromValue) ? fromValue : "",
    to: isValidDateOnly(toValue) ? toValue : "",
  };
}
