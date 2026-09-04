import assert from "node:assert/strict";

import { emitSyncDiagnostic } from "../src/services/google-sheets/sync/diagnostic-core";
import { safeSyncErrorDetails } from "../src/services/google-sheets/sync/diagnostics";

const details = safeSyncErrorDetails({ code: "P2028" });
assert.deepEqual(details, {
  errorCategory: "DATABASE",
  errorCode: "P2028",
});

const output: string[] = [];
const originalError = console.error;
try {
  console.error = (...args: unknown[]) => {
    output.push(args.map((value) => String(value)).join(" "));
  };
  emitSyncDiagnostic({
    context: { requestId: "d5a5672c-b1c1-4818-8cd1-157dfabd52d1" },
    stage: "discovery_transaction",
    status: "FAIL",
    durationMs: 61_599,
    ...details,
  });
} finally {
  console.error = originalError;
}

const line = output.join("\n");
assert.match(line, /error_category=DATABASE/u);
assert.match(line, /error_code=P2028/u);
assert.doesNotMatch(line, /DATABASE_URL|password|private_key|SELECT|stack/u);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      checks: [
        "P2028 is mapped to error_category=DATABASE",
        "P2028 is preserved as error_code=P2028",
        "diagnostic output remains bounded and sanitized",
      ],
    },
    null,
    2,
  ),
);
