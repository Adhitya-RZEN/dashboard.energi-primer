import { isAuthorizedCronRequest } from "../src/services/google-sheets/sync/cron-auth";

const secret = "test-cron-secret-value";
if (!isAuthorizedCronRequest(new Headers({ authorization: `Bearer ${secret}` }), secret))
  throw new Error("Valid cron authorization was rejected.");
if (isAuthorizedCronRequest(new Headers({ authorization: "Bearer wrong" }), secret))
  throw new Error("Invalid cron authorization was accepted.");
if (isAuthorizedCronRequest(new Headers(), secret))
  throw new Error("Missing cron authorization was accepted.");

console.log(
  JSON.stringify(
    {
      status: "PASS",
      checks: [
        "valid bearer secret is accepted",
        "invalid bearer secret is rejected",
        "missing authorization is rejected",
      ],
    },
    null,
    2,
  ),
);
