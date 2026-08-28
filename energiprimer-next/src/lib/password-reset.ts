import { randomBytes } from "node:crypto";
import "server-only";

const RESET_EXPIRY_MINUTES = 60;

export function createPasswordResetToken() {
  return randomBytes(32).toString("hex");
}

export function createRememberToken() {
  return randomBytes(45).toString("base64url");
}

export function isPasswordResetExpired(createdAt: Date, now = new Date()) {
  const ageInMinutes = (now.getTime() - createdAt.getTime()) / 60000;
  return ageInMinutes > RESET_EXPIRY_MINUTES;
}

export function isPasswordResetThrottled(createdAt: Date, now = new Date()) {
  const ageInSeconds = (now.getTime() - createdAt.getTime()) / 1000;
  return ageInSeconds < 60;
}

export function getPasswordResetUrl(token: string, email: string) {
  const baseUrl = (process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const params = new URLSearchParams({ email });
  return `${baseUrl}/reset-password/${encodeURIComponent(token)}?${params.toString()}`;
}

/**
 * Laravel uses MAIL_MAILER=log locally. Keep that behavior for development,
 * but refuse to treat log output as production mail delivery.
 */
export async function deliverPasswordResetEmail(email: string, token: string) {
  const mailer = process.env.AUTH_MAILER || process.env.MAIL_MAILER || "log";

  if (mailer !== "log" || process.env.NODE_ENV === "production") {
    throw new Error("Password reset mailer is not configured for this environment.");
  }

  console.info("[auth] Development password reset link", {
    email,
    url: getPasswordResetUrl(token, email),
  });
}
