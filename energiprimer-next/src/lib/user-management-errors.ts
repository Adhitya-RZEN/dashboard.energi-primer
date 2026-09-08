import { Prisma } from "@prisma/client";

export type DuplicateUserField = "username" | "email";

export class UserManagementDuplicateError extends Error {
  readonly field: DuplicateUserField;

  constructor(field: DuplicateUserField) {
    super(`Duplicate user ${field}.`);
    this.name = "UserManagementDuplicateError";
    this.field = field;
  }
}

export function duplicateUserField(
  error: unknown,
): DuplicateUserField | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return null;
  }

  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target.map(String)
    : typeof target === "string"
      ? [target]
      : [];
  const fieldText = fields.join(" ").toLowerCase();
  if (fieldText.includes("username")) return "username";
  if (fieldText.includes("email")) return "email";
  return null;
}
