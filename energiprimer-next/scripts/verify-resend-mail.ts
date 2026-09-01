import {
  getMailConfigurationStatus,
  MailServiceError,
  sendEmail,
  type MailLogger,
  type ResendEmailClient,
} from "../src/lib/mail/index";
import type {
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
} from "resend";

const ENVIRONMENT_KEYS = [
  "AUTH_MAILER",
  "MAIL_MAILER",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_TEST_RECIPIENT",
] as const;

const fixtureLogger: MailLogger = {
  info() {},
  error() {},
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function saveEnvironment() {
  return new Map(
    ENVIRONMENT_KEYS.map((name) => [name, process.env[name]] as const),
  );
}

function restoreEnvironment(snapshot: Map<string, string | undefined>) {
  for (const name of ENVIRONMENT_KEYS) {
    const value = snapshot.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function setEnvironment(values: Partial<Record<(typeof ENVIRONMENT_KEYS)[number], string | undefined>>) {
  for (const name of ENVIRONMENT_KEYS) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function expectMailError(
  operation: () => Promise<unknown>,
  code: MailServiceError["code"],
) {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof MailServiceError)) {
      throw new Error(`Expected ${code} MailServiceError`);
    }
    assert(error.code === code, `Expected ${code}, received ${error.code}`);
    return;
  }

  throw new Error(`Expected ${code} but operation succeeded.`);
}

function configuredEnvironment() {
  return {
    AUTH_MAILER: "resend",
    MAIL_MAILER: undefined,
    RESEND_API_KEY: "mock-only-key",
    RESEND_FROM_EMAIL: "Energi Primer <noreply@example.test>",
    RESEND_TEST_RECIPIENT: undefined,
  } as const;
}

function message(overrides: Partial<CreateEmailOptions> = {}) {
  return {
    to: "recipient@example.test",
    subject: "Resend fixture",
    text: "Fixture email; no provider request is made by this test.",
    idempotencyKey: "fixture-idempotency-key",
    ...overrides,
  };
}

function successfulClient(
  onSend: (payload: CreateEmailOptions, options?: CreateEmailRequestOptions) => void,
): ResendEmailClient {
  return {
    emails: {
      async send(
        payload: CreateEmailOptions,
        options?: CreateEmailRequestOptions,
      ): Promise<CreateEmailResponse> {
        onSend(payload, options);
        return { data: { id: "mock-email-id" }, error: null, headers: null };
      },
    },
  };
}

async function runFixtures() {
  const snapshot = saveEnvironment();
  try {
    setEnvironment({
      AUTH_MAILER: "resend",
      RESEND_API_KEY: undefined,
      RESEND_FROM_EMAIL: undefined,
      RESEND_TEST_RECIPIENT: undefined,
    });
    await expectMailError(
      () => sendEmail(message(), { logger: fixtureLogger }),
      "RESEND_CONFIG_MISSING",
    );

    setEnvironment({
      ...configuredEnvironment(),
      RESEND_FROM_EMAIL: "not-an-email",
    });
    await expectMailError(
      () => sendEmail(message(), { logger: fixtureLogger }),
      "RESEND_CONFIG_INVALID",
    );

    setEnvironment(configuredEnvironment());
    let sentPayload: CreateEmailOptions | undefined;
    let sentOptions: CreateEmailRequestOptions | undefined;
    const accepted = await sendEmail(
      message(),
      {
        logger: fixtureLogger,
        resendClient: successfulClient((payload, options) => {
          sentPayload = payload;
          sentOptions = options;
        }),
      },
    );
    assert(accepted.provider === "resend", "Successful provider is Resend");
    assert(accepted.id === "mock-email-id", "Provider message ID is returned");
    assert(sentPayload?.to === "recipient@example.test", "Recipient is preserved");
    assert(sentPayload?.subject === "Resend fixture", "Subject is preserved");
    assert(sentOptions?.idempotencyKey === "fixture-idempotency-key", "Idempotency key is forwarded");

    const rateLimitClient: ResendEmailClient = {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return {
            data: null,
            error: {
              name: "rate_limit_exceeded",
              message: "fixture",
              statusCode: 429,
            },
            headers: null,
          };
        },
      },
    };
    await expectMailError(
      () =>
        sendEmail(message(), {
          logger: fixtureLogger,
          resendClient: rateLimitClient,
        }),
      "RESEND_RATE_LIMIT",
    );

    const authClient: ResendEmailClient = {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return {
            data: null,
            error: {
              name: "invalid_api_key",
              message: "fixture",
              statusCode: 401,
            },
            headers: null,
          };
        },
      },
    };
    await expectMailError(
      () =>
        sendEmail(message(), {
          logger: fixtureLogger,
          resendClient: authClient,
        }),
      "RESEND_AUTH",
    );

    const validationClient: ResendEmailClient = {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return {
            data: null,
            error: {
              name: "invalid_from_address",
              message: "fixture",
              statusCode: 422,
            },
            headers: null,
          };
        },
      },
    };
    await expectMailError(
      () =>
        sendEmail(message(), {
          logger: fixtureLogger,
          resendClient: validationClient,
        }),
      "RESEND_VALIDATION",
    );

    const providerClient: ResendEmailClient = {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return {
            data: null,
            error: {
              name: "internal_server_error",
              message: "fixture",
              statusCode: 500,
            },
            headers: null,
          };
        },
      },
    };
    await expectMailError(
      () =>
        sendEmail(message(), {
          logger: fixtureLogger,
          resendClient: providerClient,
        }),
      "RESEND_PROVIDER",
    );

    const malformedResponseClient: ResendEmailClient = {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return {
            data: null,
            error: null,
            headers: null,
          } as unknown as CreateEmailResponse;
        },
      },
    };
    await expectMailError(
      () =>
        sendEmail(message(), {
          logger: fixtureLogger,
          resendClient: malformedResponseClient,
        }),
      "RESEND_PROVIDER",
    );

    const networkClient: ResendEmailClient = {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          const error = new Error("fixture network failure") as Error & {
            code?: string;
          };
          error.code = "ECONNRESET";
          throw error;
        },
      },
    };
    await expectMailError(
      () =>
        sendEmail(message(), {
          logger: fixtureLogger,
          resendClient: networkClient,
        }),
      "RESEND_NETWORK",
    );

    const timeoutClient: ResendEmailClient = {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return new Promise(() => {});
        },
      },
    };
    await expectMailError(
      () =>
        sendEmail(message(), {
          logger: fixtureLogger,
          resendClient: timeoutClient,
          timeoutMs: 1,
        }),
      "RESEND_NETWORK",
    );

    setEnvironment({
      AUTH_MAILER: "log",
      RESEND_API_KEY: undefined,
      RESEND_FROM_EMAIL: undefined,
      RESEND_TEST_RECIPIENT: undefined,
    });
    const status = getMailConfigurationStatus();
    assert(status.mode === "log", "Development log mode is detected");
    assert(!status.resendApiKeyConfigured, "Missing API key is reported safely");
    assert(!status.resendFromConfigured, "Missing sender is reported safely");

    return {
      status: "PASS",
      realEmail: "NOT_REQUESTED",
      checks: [
        "missing Resend configuration",
        "invalid sender configuration",
      "mock provider success and idempotency key",
      "provider rate-limit classification",
      "provider authentication classification",
      "provider validation classification",
      "provider failure classification",
      "malformed provider response classification",
      "network failure classification",
        "timeout classification",
        "safe configuration status",
      ],
    };
  } finally {
    restoreEnvironment(snapshot);
  }
}

async function runRealSmokeTest() {
  const status = getMailConfigurationStatus();
  const recipient = process.env.RESEND_TEST_RECIPIENT?.trim();

  if (
    status.mode !== "resend" ||
    !status.resendApiKeyConfigured ||
    !status.resendFromConfigured ||
    !recipient
  ) {
    return { status: "SKIP_REAL_EMAIL_TEST", reason: "Explicit test recipient or Resend configuration is missing." };
  }

  const result = await sendEmail({
    to: recipient,
    subject: "Energi Primer Resend smoke test",
    text: "Ini adalah satu controlled smoke test Resend dari aplikasi Energi Primer.",
    html: "<p>Ini adalah satu controlled smoke test Resend dari aplikasi Energi Primer.</p>",
    idempotencyKey: "energi-primer-resend-smoke-test",
  });

  return {
    status: "PASS",
    realEmail: "SENT_ONCE",
    providerMessageId: result.id,
  };
}

try {
  const fixtureResult = await runFixtures();
  if (process.argv.includes("--real")) {
    console.log(JSON.stringify({ ...fixtureResult, realTest: await runRealSmokeTest() }, null, 2));
  } else {
    console.log(JSON.stringify(fixtureResult, null, 2));
  }
} catch (error) {
  console.error(
    "Resend verification failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
}
