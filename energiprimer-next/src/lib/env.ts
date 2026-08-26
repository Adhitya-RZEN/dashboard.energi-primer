type NodeEnvironment = "development" | "production" | "test";

function getNodeEnvironment(): NodeEnvironment {
  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  if (process.env.NODE_ENV === "test") {
    return "test";
  }

  return "development";
}

/**
 * Public, non-secret runtime configuration.
 *
 * Keep credentials and other server-only values out of this object. Next.js
 * exposes variables prefixed with NEXT_PUBLIC_ to browser bundles.
 */
export const publicEnv = Object.freeze({
  appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Energi Primer",
  appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "",
  nodeEnv: getNodeEnvironment(),
});
