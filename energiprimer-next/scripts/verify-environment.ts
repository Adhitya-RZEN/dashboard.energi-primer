import { getServerEnvironmentPreflight } from "../src/lib/server-env";

const preflight = getServerEnvironmentPreflight();
const status = preflight.startup.ready ? "PASS" : "FAIL";

console.log(
  JSON.stringify(
    {
      status,
      checks: preflight,
      secretsPrinted: false,
    },
    null,
    2,
  ),
);

if (!preflight.startup.ready) process.exitCode = 1;
