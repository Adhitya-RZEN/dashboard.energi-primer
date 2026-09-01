import assert from "node:assert/strict";

import {
  DASHBOARD_OPERATIONAL_TIME_ZONE,
  constrainOverviewQuery,
  getCalendarDateInOperationalTimeZone,
  getDashboardCutoffDate,
  isDateKeyOnOrBefore,
  maxVisibleDayForMonth,
} from "../src/lib/dashboard-date";

const checks: string[] = [];

function check(name: string, callback: () => void) {
  callback();
  checks.push(name);
}

check("operational timezone is explicit", () => {
  assert.equal(DASHBOARD_OPERATIONAL_TIME_ZONE, "Asia/Makassar");
  assert.equal(
    getCalendarDateInOperationalTimeZone(
      new Date("2026-07-31T16:00:00.000Z"),
    ),
    "2026-08-01",
  );
});

check("real-world date minus one calendar day", () => {
  assert.equal(
    getDashboardCutoffDate(new Date("2026-08-01T00:00:00.000Z")),
    "2026-07-31",
  );
  assert.equal(
    getDashboardCutoffDate(new Date("2026-08-02T00:00:00.000Z")),
    "2026-08-01",
  );
  assert.equal(
    getDashboardCutoffDate(new Date("2026-09-01T00:00:00.000Z")),
    "2026-08-31",
  );
});

check("post-cutoff dates are hidden without changing source values", () => {
  const fixture = ["2026-07-30", "2026-07-31", "2026-08-01"];
  assert.deepEqual(
    fixture.filter((value) => isDateKeyOnOrBefore(value, "2026-07-31")),
    ["2026-07-30", "2026-07-31"],
  );
  assert.deepEqual(
    fixture.filter((value) => isDateKeyOnOrBefore(value, "2026-08-01")),
    fixture,
  );
});

check("date picker maximum follows the cutoff", () => {
  assert.equal(maxVisibleDayForMonth(2026, 7, "2026-07-31"), 31);
  assert.equal(maxVisibleDayForMonth(2026, 8, "2026-07-31"), 0);
  assert.equal(maxVisibleDayForMonth(2026, 8, "2026-08-01"), 1);
  assert.deepEqual(
    constrainOverviewQuery(
      { year: 2026, month: 8, day: 31 },
      "2026-07-31",
    ),
    { year: 2026, month: 7, day: 31 },
  );
  assert.deepEqual(
    constrainOverviewQuery(
      { year: 2026, month: 9, day: 2 },
      "2026-08-01",
    ),
    { year: 2026, month: 8, day: 1 },
  );
});

console.log(
  JSON.stringify(
    {
      status: "PASS",
      timezone: DASHBOARD_OPERATIONAL_TIME_ZONE,
      checks,
      databaseWrites: 0,
      syncRuns: 0,
      deployments: 0,
    },
    null,
    2,
  ),
);
