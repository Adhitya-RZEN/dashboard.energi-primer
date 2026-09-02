export function safeErrorCategory(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    message.includes("password") ||
    message.includes("authentication") ||
    message.includes("p1000")
  ) {
    return "AUTHENTICATION_ERROR";
  }
  if (
    message.includes("certificate") ||
    message.includes("ssl") ||
    message.includes("tls")
  ) {
    return "TLS_OR_SSL_ERROR";
  }
  if (
    message.includes("timeout") ||
    message.includes("can't reach") ||
    message.includes("could not connect") ||
    message.includes("eai_again") ||
    message.includes("p1001") ||
    message.includes("p1008") ||
    message.includes("p1017")
  ) {
    return "NETWORK_ERROR";
  }
  if (message.includes("configuration") || message.includes("not configured")) {
    return "PROVIDER_CONFIGURATION_ERROR";
  }
  if (message.includes("invalid") || message.includes("validation")) {
    return "VALIDATION_ERROR";
  }
  if (message) return "PROVIDER_ERROR";
  return "UNKNOWN_ERROR";
}
