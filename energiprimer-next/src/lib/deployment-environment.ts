export type DeploymentEnvironment =
  | "production"
  | "preview"
  | "development"
  | "unknown";

type EnvironmentVariables = {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

/**
 * Vercel environment is the authoritative deployment identity.
 *
 * NODE_ENV is deliberately not used to identify a Vercel Production
 * deployment because Preview deployments can also run with a production
 * Next.js build/runtime. When VERCEL_ENV is absent, only an explicit local
 * development NODE_ENV preserves the existing development behavior.
 */
export function getDeploymentEnvironment(
  environment: EnvironmentVariables = process.env,
): DeploymentEnvironment {
  const vercelEnvironment = environment.VERCEL_ENV?.trim().toLowerCase();

  if (!vercelEnvironment) {
    return environment.NODE_ENV?.trim().toLowerCase() === "development"
      ? "development"
      : "unknown";
  }
  if (vercelEnvironment === "production") return "production";
  if (vercelEnvironment === "preview") return "preview";
  if (vercelEnvironment === "development") return "development";

  return "unknown";
}

export function isPreviewEnvironment(
  environment: EnvironmentVariables = process.env,
): boolean {
  return getDeploymentEnvironment(environment) === "preview";
}

/**
 * Google Sheets sync is write-capable in Production and keeps its existing
 * behavior in local development. Vercel Preview and unknown deployment
 * identities are denied before authentication or the sync engine runs.
 */
export function isSyncAllowedEnvironment(
  environment: EnvironmentVariables = process.env,
): boolean {
  const deploymentEnvironment = getDeploymentEnvironment(environment);
  return deploymentEnvironment === "production" ||
    deploymentEnvironment === "development";
}
