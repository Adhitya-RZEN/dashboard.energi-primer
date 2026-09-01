import { createHash, randomBytes } from "node:crypto";
import "server-only";

import {
  MailServiceError,
  getMailMode,
  sendEmail,
  type MailSendResult,
} from "@/lib/mail/index";

const RESET_EXPIRY_MINUTES = 60;

export function createPasswordResetToken() {
  return randomBytes(32).toString("hex");
}

export function createRememberToken() {
  return randomBytes(45).toString("base64url");
}

export function isPasswordResetExpired(createdAt: Date, now = new Date()) {
  const ageInMinutes = (now.getTime() - createdAt.getTime()) / 60000;
  return ageInMinutes < 0 || ageInMinutes >= RESET_EXPIRY_MINUTES;
}

export function isPasswordResetThrottled(createdAt: Date, now = new Date()) {
  const ageInSeconds = (now.getTime() - createdAt.getTime()) / 1000;
  return ageInSeconds < 60;
}

export function getPasswordResetUrl(token: string, email: string) {
  const configuredBaseUrl =
    process.env.NODE_ENV === "production"
      ? process.env.AUTH_URL?.trim()
      : process.env.AUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredBaseUrl && process.env.NODE_ENV === "production") {
    throw new MailServiceError(
      "RESEND_CONFIG_MISSING",
      "Password reset application URL is not configured.",
    );
  }

  const baseUrl = (configuredBaseUrl || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  try {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Unsupported URL protocol");
    }
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new MailServiceError(
        "RESEND_CONFIG_INVALID",
        "Password reset application URL must use HTTPS.",
      );
    }
  } catch (error) {
    if (error instanceof MailServiceError) throw error;
    throw new MailServiceError(
      "RESEND_CONFIG_INVALID",
      "Password reset application URL is invalid.",
    );
  }

  const params = new URLSearchParams({ email });
  return `${baseUrl}/reset-password/${encodeURIComponent(token)}?${params.toString()}`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

/**
 * Laravel uses MAIL_MAILER=log locally. Keep that behavior for development,
 * and use Resend only when it is explicitly selected by AUTH_MAILER.
 */
export async function deliverPasswordResetEmail(
  email: string,
  token: string,
): Promise<MailSendResult | { provider: "log"; id: null }> {
  const mailer = getMailMode();

  if (mailer === "log") {
    if (process.env.NODE_ENV === "production") {
      throw new MailServiceError(
        "RESEND_CONFIG_MISSING",
        "Production password reset delivery is not configured.",
      );
    }

    console.info("[auth] Development password reset email suppressed", {
      expiresInMinutes: RESET_EXPIRY_MINUTES,
    });
    return { provider: "log", id: null };
  }

  if (mailer !== "resend") {
    throw new MailServiceError(
      "RESEND_CONFIG_INVALID",
      "Configured mail provider is unsupported.",
    );
  }

  const resetUrl = getPasswordResetUrl(token, email);
  const escapedResetUrl = escapeHtml(resetUrl);
  const idempotencyKey = `password-reset-${createHash("sha256")
    .update(token)
    .digest("hex")}`;

  return sendEmail({
    to: email,
    subject: "Reset password Energi Primer",
    text: [
      "Kami menerima permintaan untuk mengatur ulang password akun Energi Primer.",
      "",
      `Buka tautan berikut untuk membuat password baru: ${resetUrl}`,
      "Tautan ini berlaku selama 60 menit.",
      "Jika Anda tidak meminta reset password, abaikan email ini.",
    ].join("\n"),
    html: [
      "<p>Kami menerima permintaan untuk mengatur ulang password akun Energi Primer.</p>",
      `<p><a href="${escapedResetUrl}">Buat password baru</a></p>`,
      "<p>Tautan ini berlaku selama 60 menit.</p>",
      "<p>Jika Anda tidak meminta reset password, abaikan email ini.</p>",
    ].join(""),
    idempotencyKey,
  });
}
