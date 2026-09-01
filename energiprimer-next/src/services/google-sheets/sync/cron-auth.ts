import "server-only";

import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export function isAuthorizedCronRequest(
  headers: Pick<Headers, "get">,
  configuredSecret = process.env.CRON_SECRET,
) {
  const secret = configuredSecret?.trim();
  if (!secret) return false;
  const authorization = headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  return safeEqual(authorization.slice(prefix.length).trim(), secret);
}

