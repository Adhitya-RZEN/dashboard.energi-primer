import { randomBytes } from "node:crypto";
import "server-only";

/**
 * Generates the legacy users.remember_token value used when a password
 * changes. This is not a recovery token and is kept separate from the
 * decommissioned recovery flow.
 */
export function createRememberToken() {
  return randomBytes(45).toString("base64url");
}
