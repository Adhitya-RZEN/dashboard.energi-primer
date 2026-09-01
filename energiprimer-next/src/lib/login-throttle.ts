import { createHash } from "node:crypto";
import "server-only";

import { prisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 6;
const WINDOW_SECONDS = 60;

function cacheKey(email: string, ipAddress: string) {
  const digest = createHash("sha256")
    .update(`${email}\u0000${ipAddress}`)
    .digest("hex");
  return `next:auth:login:v1:${digest}`;
}

function requestCount(value: string | null) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value) as { count?: unknown };
    return typeof parsed.count === "number" &&
      Number.isInteger(parsed.count) &&
      parsed.count >= 0
      ? parsed.count
      : 0;
  } catch {
    return 0;
  }
}

export function getRequestIp(
  forwardedFor: string | null,
  realIp: string | null,
) {
  const forwardedIp = forwardedFor?.split(",", 1)[0]?.trim();
  return forwardedIp || realIp?.trim() || "unknown";
}

/**
 * Laravel's `throttle:6,1` equivalent for credential attempts.
 * Counts every attempt, including valid credentials, before user lookup.
 * The existing Laravel cache table is used; no schema change is needed.
 */
export async function consumeLoginAttempt(email: string, ipAddress: string) {
  const now = Math.floor(Date.now() / 1000);
  const key = cacheKey(email, ipAddress);
  const existing = await prisma.cache.findUnique({ where: { key } });
  const expiresAt = Number(existing?.expiration ?? 0);

  if (existing && expiresAt > now) {
    const count = requestCount(existing.value);
    if (count >= MAX_ATTEMPTS) {
      return { allowed: false, retryAfterSeconds: expiresAt - now };
    }

    await prisma.cache.update({
      where: { key },
      data: {
        value: JSON.stringify({ count: count + 1 }),
        expiration: BigInt(expiresAt),
      },
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  await prisma.cache.upsert({
    where: { key },
    create: {
      key,
      value: JSON.stringify({ count: 1 }),
      expiration: BigInt(now + WINDOW_SECONDS),
    },
    update: {
      value: JSON.stringify({ count: 1 }),
      expiration: BigInt(now + WINDOW_SECONDS),
    },
  });

  return { allowed: true, retryAfterSeconds: 0 };
}
