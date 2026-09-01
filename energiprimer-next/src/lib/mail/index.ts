import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
  type ErrorResponse,
} from "resend";
import "server-only";

const DEFAULT_RESEND_TIMEOUT_MS = 10_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MailMode = "log" | "resend" | "unsupported";

export type MailErrorCode =
  | "RESEND_CONFIG_MISSING"
  | "RESEND_CONFIG_INVALID"
  | "RESEND_AUTH"
  | "RESEND_RATE_LIMIT"
  | "RESEND_NETWORK"
  | "RESEND_VALIDATION"
  | "RESEND_PROVIDER"
  | "RESEND_UNKNOWN";

export class MailServiceError extends Error {
  readonly code: MailErrorCode;
  readonly retryable: boolean;
  readonly providerStatusCode: number | null;

  constructor(
    code: MailErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      providerStatusCode?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "MailServiceError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.providerStatusCode = options.providerStatusCode ?? null;
  }
}

export type MailMessage = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  idempotencyKey?: string;
};

export type MailSendResult = {
  provider: "resend";
  id: string;
};

export type ResendEmailClient = {
  emails: {
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ): Promise<CreateEmailResponse>;
  };
};

export type MailLogger = {
  info(event: string, details: Record<string, string | number | boolean>): void;
  error(event: string, details: Record<string, string | number | boolean>): void;
};

export type MailServiceDependencies = {
  resendClient?: ResendEmailClient;
  timeoutMs?: number;
  logger?: MailLogger;
};

export type MailConfigurationStatus = {
  mode: string;
  resendApiKeyConfigured: boolean;
  resendFromConfigured: boolean;
  senderFormatValid: boolean;
  applicationUrlConfigured: boolean;
};

const defaultLogger: MailLogger = {
  info(event, details) {
    console.info(`[mail] ${event}`, details);
  },
  error(event, details) {
    console.error(`[mail] ${event}`, details);
  },
};

function readEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getMailMode(): string {
  return (
    readEnvironmentValue("AUTH_MAILER") ??
    readEnvironmentValue("MAIL_MAILER") ??
    "log"
  ).toLowerCase();
}

function isEmailAddress(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

function isSenderAddress(value: string) {
  const match = value.trim().match(/<([^<>]+)>/);
  return isEmailAddress(match?.[1] ?? value);
}

function getResendApiKey() {
  return readEnvironmentValue("RESEND_API_KEY");
}

function getResendFromEmail() {
  return readEnvironmentValue("RESEND_FROM_EMAIL");
}

export function getMailConfigurationStatus(): MailConfigurationStatus {
  const from = getResendFromEmail();

  return {
    mode: getMailMode(),
    resendApiKeyConfigured: Boolean(getResendApiKey()),
    resendFromConfigured: Boolean(from),
    senderFormatValid: Boolean(from && isSenderAddress(from)),
    applicationUrlConfigured: Boolean(
      readEnvironmentValue("AUTH_URL") ??
        readEnvironmentValue("NEXT_PUBLIC_APP_URL"),
    ),
  };
}

function maskEmail(value: string) {
  const address = value.trim().match(/<([^<>]+)>/)?.[1] ?? value.trim();
  const [localPart, domain] = address.split("@");
  if (!localPart || !domain) return "[redacted]";

  const visible = localPart.slice(0, 1);
  return `${visible}${"*".repeat(Math.min(Math.max(localPart.length - 1, 1), 3))}@${domain}`;
}

function maskedRecipients(to: string | string[]) {
  const recipients = Array.isArray(to) ? to : [to];
  return {
    recipientCount: recipients.length,
    recipient: recipients.length === 1 ? maskEmail(recipients[0]) : "[multiple]",
  };
}

function missingConfigurationError() {
  return new MailServiceError(
    "RESEND_CONFIG_MISSING",
    "Email delivery is not configured.",
  );
}

function validateMessage(message: MailMessage, sender: string) {
  const recipients = Array.isArray(message.to) ? message.to : [message.to];

  if (
    recipients.length === 0 ||
    recipients.length > 50 ||
    recipients.some(
      (recipient) =>
        typeof recipient !== "string" || !isEmailAddress(recipient),
    )
  ) {
    throw new MailServiceError(
      "RESEND_VALIDATION",
      "Email recipient is invalid.",
    );
  }

  if (!isSenderAddress(sender)) {
    throw new MailServiceError(
      "RESEND_CONFIG_INVALID",
      "Email sender configuration is invalid.",
    );
  }

  if (!message.subject.trim() || message.subject.length > 998) {
    throw new MailServiceError(
      "RESEND_VALIDATION",
      "Email subject is invalid.",
    );
  }

  if (!message.html?.trim() && !message.text?.trim()) {
    throw new MailServiceError(
      "RESEND_VALIDATION",
      "Email body is empty.",
    );
  }

  if (message.idempotencyKey && message.idempotencyKey.length > 256) {
    throw new MailServiceError(
      "RESEND_VALIDATION",
      "Email idempotency key is invalid.",
    );
  }
}

function classifyResendError(error: ErrorResponse) {
  const statusCode = error.statusCode ?? null;
  const providerCode = error.name;

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    [
      "missing_api_key",
      "invalid_api_key",
      "restricted_api_key",
      "invalid_access",
      "security_error",
    ].includes(providerCode)
  ) {
    return new MailServiceError("RESEND_AUTH", "Email provider authentication failed.", {
      providerStatusCode: statusCode,
    });
  }

  if (
    statusCode === 429 ||
    ["rate_limit_exceeded", "monthly_quota_exceeded", "daily_quota_exceeded"].includes(
      providerCode,
    )
  ) {
    return new MailServiceError("RESEND_RATE_LIMIT", "Email provider rate limit reached.", {
      retryable: true,
      providerStatusCode: statusCode,
    });
  }

  if (
    (statusCode !== null && statusCode >= 400 && statusCode < 500) ||
    [
      "validation_error",
      "invalid_from_address",
      "invalid_parameter",
      "missing_required_field",
      "invalid_attachment",
    ].includes(providerCode)
  ) {
    return new MailServiceError("RESEND_VALIDATION", "Email request was rejected by the provider.", {
      providerStatusCode: statusCode,
    });
  }

  if (
    (statusCode !== null && statusCode >= 500) ||
    ["application_error", "internal_server_error"].includes(providerCode)
  ) {
    return new MailServiceError("RESEND_PROVIDER", "Email provider is temporarily unavailable.", {
      retryable: true,
      providerStatusCode: statusCode,
    });
  }

  return new MailServiceError("RESEND_UNKNOWN", "Email delivery failed.", {
    providerStatusCode: statusCode,
  });
}

function classifyThrownError(error: unknown) {
  if (error instanceof MailServiceError) return error;

  const errorName = error instanceof Error ? error.name : "";
  const errorCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";

  if (
    errorName === "AbortError" ||
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH"].includes(
      errorCode,
    )
  ) {
    return new MailServiceError(
      "RESEND_NETWORK",
      "Email provider could not be reached.",
      { retryable: true },
    );
  }

  return new MailServiceError("RESEND_UNKNOWN", "Email delivery failed.");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new MailServiceError(
          "RESEND_NETWORK",
          "Email provider request timed out.",
          { retryable: true },
        ),
      );
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function sendEmail(
  message: MailMessage,
  dependencies: MailServiceDependencies = {},
): Promise<MailSendResult> {
  const logger = dependencies.logger ?? defaultLogger;
  const mode = getMailMode();

  if (mode !== "resend") {
    throw new MailServiceError(
      mode === "log" ? "RESEND_CONFIG_MISSING" : "RESEND_CONFIG_INVALID",
      mode === "log"
        ? "Resend delivery is not enabled for this environment."
        : "Configured mail provider is unsupported.",
    );
  }

  const apiKey = getResendApiKey();
  const configuredFrom = getResendFromEmail();

  if (!apiKey || !configuredFrom) {
    throw missingConfigurationError();
  }

  if (!isSenderAddress(configuredFrom)) {
    throw new MailServiceError(
      "RESEND_CONFIG_INVALID",
      "Email sender configuration is invalid.",
    );
  }

  validateMessage(message, message.from ?? configuredFrom);

  const client = dependencies.resendClient ?? new Resend(apiKey);
  const payload: CreateEmailOptions = {
    from: message.from ?? configuredFrom,
    to: message.to,
    subject: message.subject,
    html: message.html ?? "",
    text: message.text ?? "",
  };
  const requestOptions: CreateEmailRequestOptions | undefined =
    message.idempotencyKey
      ? { idempotencyKey: message.idempotencyKey }
      : undefined;

  try {
    const response = await withTimeout(
      client.emails.send(payload, requestOptions),
      dependencies.timeoutMs ?? DEFAULT_RESEND_TIMEOUT_MS,
    );

    if (response.error) {
      throw classifyResendError(response.error);
    }

    const id = response.data?.id;
    if (!id) {
      throw new MailServiceError(
        "RESEND_PROVIDER",
        "Email provider returned an invalid response.",
      );
    }

    logger.info("delivery.accepted", {
      provider: "resend",
      messageId: id,
      ...maskedRecipients(message.to),
    });

    return { provider: "resend", id };
  } catch (error) {
    const safeError = classifyThrownError(error);
    logger.error("delivery.failed", {
      code: safeError.code,
      retryable: safeError.retryable,
      ...maskedRecipients(message.to),
    });
    throw safeError;
  }
}
