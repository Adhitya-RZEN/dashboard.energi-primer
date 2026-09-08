import "server-only";

import { Prisma, UserAuditAction, UserStatus } from "@prisma/client";

import { requireAdminUser } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

import {
  AUDIT_LOG_ACTIONS,
  parseAuditLogQuery,
  type AuditLogAction,
  type AuditLogQuery,
} from "@/lib/audit-log-validation";

export {
  AUDIT_LOG_ACTIONS,
  parseAuditLogQuery,
};
export type { AuditLogAction, AuditLogQuery } from "@/lib/audit-log-validation";

const auditLogSelect = {
  id: true,
  createdAt: true,
  action: true,
  metadata: true,
  actor: {
    select: {
      username: true,
      name: true,
      status: true,
    },
  },
  target: {
    select: {
      username: true,
      name: true,
      status: true,
    },
  },
} as const;

type AuditLogRecord = Prisma.UserAuditLogGetPayload<{
  select: typeof auditLogSelect;
}>;

export type AuditLogAccount = {
  username: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
};

export type AuditLogItem = {
  id: string;
  createdAt: string;
  action: AuditLogAction;
  actionLabel: string;
  actor: AuditLogAccount;
  target: AuditLogAccount;
  details: string;
};

export type AuditLogPage = {
  items: AuditLogItem[];
  page: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  query: AuditLogQuery;
};

const actionLabels: Record<AuditLogAction, string> = {
  [UserAuditAction.USER_CREATED]: "User created",
  [UserAuditAction.USER_UPDATED]: "User updated",
  [UserAuditAction.PASSWORD_RESET]: "Password reset",
  [UserAuditAction.ROLE_CHANGED]: "Role changed",
  [UserAuditAction.USER_ENABLED]: "User enabled",
  [UserAuditAction.USER_DISABLED]: "User disabled",
};

function parseDateOnly(value: string, endExclusive = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function safeMetadataString(metadata: Prisma.JsonValue | null, key: string) {
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return null;
  }
  const value = metadata[key];
  return typeof value === "string" && value.length <= 100 ? value : null;
}

function safeRoleLabel(value: string | null) {
  return value === "ADMIN" || value === "USER" ? value : null;
}

function safeStatusLabel(value: string | null) {
  return value === "ACTIVE" || value === "DISABLED" ? value : null;
}

function formatAuditDetails(action: AuditLogAction, metadata: Prisma.JsonValue | null) {
  switch (action) {
    case UserAuditAction.USER_CREATED: {
      const username = safeMetadataString(metadata, "username");
      const role = safeRoleLabel(safeMetadataString(metadata, "role"));
      return username && role
        ? `Akun ${username} dibuat sebagai ${role}.`
        : "Akun dibuat.";
    }
    case UserAuditAction.PASSWORD_RESET:
      return "Password akun direset.";
    case UserAuditAction.ROLE_CHANGED: {
      const fromRole = safeRoleLabel(safeMetadataString(metadata, "fromRole"));
      const toRole = safeRoleLabel(safeMetadataString(metadata, "toRole"));
      return fromRole && toRole
        ? `Role berubah dari ${fromRole} menjadi ${toRole}.`
        : "Role akun berubah.";
    }
    case UserAuditAction.USER_ENABLED:
    case UserAuditAction.USER_DISABLED: {
      const fromStatus = safeStatusLabel(
        safeMetadataString(metadata, "fromStatus"),
      );
      const toStatus = safeStatusLabel(safeMetadataString(metadata, "toStatus"));
      return fromStatus && toStatus
        ? `Status berubah dari ${fromStatus} menjadi ${toStatus}.`
        : "Status akun berubah.";
    }
    case UserAuditAction.USER_UPDATED:
      return "Perubahan akun tercatat.";
  }
}

function normalizeAccount(account: AuditLogRecord["actor"]): AuditLogAccount {
  return {
    username: account.username,
    name: account.name,
    status:
      account.status === UserStatus.DISABLED ? UserStatus.DISABLED : UserStatus.ACTIVE,
  };
}

function toAuditLogItem(record: AuditLogRecord): AuditLogItem {
  const action = record.action as AuditLogAction;
  return {
    id: record.id.toString(),
    createdAt: record.createdAt.toISOString(),
    action,
    actionLabel: actionLabels[action] ?? "Account activity",
    actor: normalizeAccount(record.actor),
    target: normalizeAccount(record.target),
    details: formatAuditDetails(action, record.metadata),
  };
}

function buildWhere(query: AuditLogQuery): Prisma.UserAuditLogWhereInput {
  const where: Prisma.UserAuditLogWhereInput = {};
  if (query.action !== "ALL") where.action = query.action;

  const from = parseDateOnly(query.from);
  const to = parseDateOnly(query.to, true);
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}),
    };
  }

  if (query.search) {
    where.OR = [
      { actor: { is: { username: { contains: query.search, mode: "insensitive" } } } },
      { actor: { is: { name: { contains: query.search, mode: "insensitive" } } } },
      { target: { is: { username: { contains: query.search, mode: "insensitive" } } } },
      { target: { is: { name: { contains: query.search, mode: "insensitive" } } } },
    ];
  }

  return where;
}

/**
 * The direct service entry point is guarded as well as the route. This keeps
 * future server callers from accidentally turning the audit reader into an
 * unprotected data access helper.
 */
export async function listAuditLogsForAdmin(
  params: Readonly<Record<string, string | string[] | undefined>> = {},
) {
  await requireAdminUser();
  return listAuditLogsAfterAdminGuard(parseAuditLogQuery(params));
}

export async function listAuditLogsAfterAdminGuard(
  query: AuditLogQuery,
): Promise<AuditLogPage> {
  const records = await prisma.userAuditLog.findMany({
    where: buildWhere(query),
    select: auditLogSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize + 1,
  });

  const hasNextPage = records.length > query.pageSize;
  const items = records.slice(0, query.pageSize).map(toAuditLogItem);
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    hasPreviousPage: query.page > 1,
    hasNextPage,
    query,
  };
}
