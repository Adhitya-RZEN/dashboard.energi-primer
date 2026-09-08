import {
  ADMIN_ROLE,
  USER_ROLE,
  type AuthorizationRole,
} from "./authorization-policy";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export type CreateUserField =
  | "username"
  | "name"
  | "email"
  | "password"
  | "confirmPassword"
  | "role";

export type CreateUserFieldErrors = Partial<
  Record<CreateUserField, string>
>;

export type PasswordResetField = "newPassword" | "confirmPassword";

export type PasswordResetFieldErrors = Partial<
  Record<PasswordResetField, string>
>;

export type CreateUserInput = {
  username: unknown;
  name: unknown;
  email: unknown;
  password: unknown;
  confirmPassword: unknown;
  role: unknown;
};

export type NormalizedCreateUserInput = {
  username: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
};

export type PasswordResetInput = {
  newPassword: unknown;
  confirmPassword: unknown;
};

export type NormalizedPasswordResetInput = {
  newPassword: string;
  confirmPassword: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function normalizeCreateUserInput(
  input: CreateUserInput,
): NormalizedCreateUserInput {
  return {
    username: stringValue(input.username).trim().toLowerCase(),
    name: stringValue(input.name).trim(),
    email: stringValue(input.email).trim().toLowerCase(),
    password: stringValue(input.password),
    confirmPassword: stringValue(input.confirmPassword),
    // Role is intentionally not lowercased. The server accepts only the
    // explicit enum values ADMIN and USER.
    role: stringValue(input.role).trim(),
  };
}

export function normalizePasswordResetInput(
  input: PasswordResetInput,
): NormalizedPasswordResetInput {
  return {
    newPassword: stringValue(input.newPassword),
    confirmPassword: stringValue(input.confirmPassword),
  };
}

export function validatePasswordResetInput(input: PasswordResetInput) {
  const normalized = normalizePasswordResetInput(input);
  const fieldErrors: PasswordResetFieldErrors = {};

  if (!normalized.newPassword) {
    fieldErrors.newPassword = "Password required";
  } else if (normalized.newPassword.length < 12) {
    fieldErrors.newPassword = "Password must be at least 12 characters.";
  }

  if (!normalized.confirmPassword) {
    fieldErrors.confirmPassword = "Confirm password required";
  } else if (normalized.newPassword !== normalized.confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  return {
    input: normalized,
    fieldErrors,
    valid: Object.keys(fieldErrors).length === 0,
  };
}

export function isAuthorizationRole(value: string): value is AuthorizationRole {
  return value === ADMIN_ROLE || value === USER_ROLE;
}

export function validateCreateUserInput(input: CreateUserInput) {
  const normalized = normalizeCreateUserInput(input);
  const fieldErrors: CreateUserFieldErrors = {};

  if (!normalized.username) {
    fieldErrors.username = "Username required";
  } else if (
    normalized.username.length > 100 ||
    !USERNAME_PATTERN.test(normalized.username)
  ) {
    fieldErrors.username = "Invalid username";
  }

  if (!normalized.name) fieldErrors.name = "Name required";

  if (!normalized.email) {
    fieldErrors.email = "Email required";
  } else if (
    normalized.email.length > 254 ||
    !EMAIL_PATTERN.test(normalized.email)
  ) {
    fieldErrors.email = "Valid email required";
  }

  if (!normalized.password) {
    fieldErrors.password = "Password required";
  } else if (normalized.password.length < 12) {
    fieldErrors.password = "Password must be at least 12 characters.";
  }

  if (!normalized.confirmPassword) {
    fieldErrors.confirmPassword = "Confirm password required";
  } else if (normalized.password !== normalized.confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (!normalized.role) {
    fieldErrors.role = "Role required";
  } else if (!isAuthorizationRole(normalized.role)) {
    fieldErrors.role = "Invalid role.";
  }

  return {
    input: normalized,
    fieldErrors,
    valid: Object.keys(fieldErrors).length === 0,
  };
}
