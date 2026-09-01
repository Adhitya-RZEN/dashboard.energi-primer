/**
 * Date policy used by the normal dashboard read layer.
 *
 * Dashboard dates are date-only values.  The operational timezone is taken
 * from the existing monitoring page configuration rather than from the
 * machine timezone or from UTC.
 */
export const DASHBOARD_OPERATIONAL_TIME_ZONE = "Asia/Makassar" as const;
export const DASHBOARD_MIN_YEAR = 2024;

type CalendarParts = {
  year: number;
  month: number;
  day: number;
};

function parseCalendarDate(value: string): CalendarParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid calendar date: ${value}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatUtcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function datePartsInTimeZone(value: Date): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_OPERATIONAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter(
        (part): part is Intl.DateTimeFormatPart & {
          type: "year" | "month" | "day";
        } => ["year", "month", "day"].includes(part.type),
      )
      .map((part) => [part.type, Number(part.value)]),
  ) as Partial<CalendarParts>;
  if (!values.year || !values.month || !values.day) {
    throw new Error(
      `Unable to resolve calendar date in ${DASHBOARD_OPERATIONAL_TIME_ZONE}`,
    );
  }
  return values as CalendarParts;
}

export function getCalendarDateInOperationalTimeZone(now = new Date()) {
  const parts = datePartsInTimeZone(now);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Returns the maximum date visible in the normal dashboard.
 * This is based only on the real-world operational calendar date.
 */
export function getDashboardCutoffDate(now = new Date()) {
  const operationalDate = getCalendarDateInOperationalTimeZone(now);
  return addCalendarDays(operationalDate, -1);
}

export function addCalendarDays(value: string, amount: number) {
  const parts = parseCalendarDate(value);
  return formatUtcDate(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount)),
  );
}

export function calendarDateToUtcStart(value: string) {
  const parts = parseCalendarDate(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function maxVisibleDayForMonth(
  year: number,
  month: number,
  cutoffDate: string,
) {
  const cutoff = parseCalendarDate(cutoffDate);
  if (year > cutoff.year || (year === cutoff.year && month > cutoff.month)) {
    return 0;
  }
  if (year === cutoff.year && month === cutoff.month) return cutoff.day;
  return daysInMonth(year, month);
}

export function constrainOverviewQuery(
  query: { month: number; year: number; day: number | null },
  cutoffDate = getDashboardCutoffDate(),
) {
  const cutoff = parseCalendarDate(cutoffDate);
  const requestedYear = Number.isFinite(query.year)
    ? query.year
    : cutoff.year;
  const year = Math.min(
    cutoff.year,
    Math.max(DASHBOARD_MIN_YEAR, Math.trunc(requestedYear)),
  );
  const requestedMonth = Number.isFinite(query.month) ? query.month : 1;
  const month = Math.min(
    year === cutoff.year ? cutoff.month : 12,
    Math.max(1, Math.trunc(requestedMonth)),
  );
  const maxDay = maxVisibleDayForMonth(year, month, cutoffDate);
  const requestedDay = query.day;
  const day =
    requestedDay === null || !Number.isFinite(requestedDay) || maxDay === 0
      ? null
      : Math.min(maxDay, Math.max(1, Math.trunc(requestedDay)));

  return { month, year, day };
}

export function defaultOverviewQuery(cutoffDate = getDashboardCutoffDate()) {
  const cutoff = parseCalendarDate(cutoffDate);
  return { month: cutoff.month, year: cutoff.year, day: null };
}

export function defaultFocusDateForMonth(
  year: number,
  month: number,
  requestedDay: number | null,
  cutoffDate = getDashboardCutoffDate(),
) {
  const maxDay = maxVisibleDayForMonth(year, month, cutoffDate);
  if (maxDay === 0) return null;
  const day =
    requestedDay === null || !Number.isFinite(requestedDay)
      ? maxDay
      : Math.min(maxDay, Math.max(1, Math.trunc(requestedDay)));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isDateKeyOnOrBefore(value: string, cutoffDate: string) {
  return value <= cutoffDate;
}
