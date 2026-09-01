import "server-only";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAuthEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidAuthEmail(value: string) {
  const normalized = value.trim();
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

/**
 * Keep Auth.js redirects on the application origin. Relative paths are
 * accepted, while protocol-relative, backslash, malformed, and foreign-origin
 * URLs fall back to the configured base URL.
 */
export function resolveSafeRedirect(url: string, baseUrl: string) {
  if (
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    !/[\r\n]/.test(url)
  ) {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return baseUrl;
    }
  }

  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    if (target.origin === base.origin) return target.toString();
  } catch {
    // Invalid redirect input falls through to the safe base URL.
  }

  return baseUrl;
}
