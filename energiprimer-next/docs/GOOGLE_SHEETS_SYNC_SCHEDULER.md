# Google Sheets Sync Scheduler

Status checkpoint: **S6 PASS (code/configuration); deployment configuration pending**

## Endpoint

```text
GET  /api/sync/google-sheets
POST /api/sync/google-sheets
```

The endpoint is a server-only Vercel Cron target. It does not accept a
spreadsheet ID, worksheet ID, range, or arbitrary database target from the
request. Those values are read from server-side configuration and the local
worksheet registry.

## Authentication

The request must contain:

```http
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` is compared server-side with a constant-time comparison. It is
never returned, logged, prefixed with `NEXT_PUBLIC_`, or passed to a component.
Missing configuration returns a generic `503`; invalid authorization returns a
generic `401`.

## Scope and schedule

`vercel.json` configures:

```text
*/15 * * * *  → /api/sync/google-sheets
```

The cron invocation uses scope `current`, meaning the currently named BB period
worksheet only. This limits Google API calls and keeps the scheduled run focused
on the operational period. Historical/backfill synchronization remains an
explicit manual operation and is not triggered by arbitrary request parameters.

The current-period worksheet is discovered before sync. A newly created sheet is
therefore registered automatically; it is processed when it becomes the current
period or through an explicitly controlled operational backfill.

## Response safety

Successful responses contain only status and aggregate counters:

- worksheets scanned;
- rows scanned;
- inserted;
- updated;
- skipped;
- failed.

Worksheet titles, source IDs, raw rows, credentials, and exception details are
not returned by the endpoint.

## Runtime requirements

- Node.js runtime is explicitly selected in the route.
- Google Sheets access remains server-side.
- Prisma access remains server-side.
- The Vercel project must provide `DATABASE_URL`, Google Sheets configuration,
  `AUTH_SECRET` for the application, and `CRON_SECRET`.
- The production database must be reachable with a suitable pooled/serverless
  connection configuration. Choosing a pooler or changing production database
  infrastructure requires manual approval.

## Local verification

Authorization logic:

```bash
npm run sync:verify-cron-auth
```

Manual local trigger yang terkontrol tersedia melalui:

```bash
npm run sheets:sync -- --worksheet=Juli26-BB
```

CLI ini memakai `triggerType=manual` dan tetap menolak target database
non-local. Opsi `--current` dapat dipakai untuk scope worksheet periode berjalan;
tanpa opsi tersebut, worksheet registry yang valid diproses sebagai backfill
manual.

The route itself must be tested in a local server with a test-only `CRON_SECRET`
before deployment. No deployment was performed in Phase 11.

## Vercel configuration still required

1. Set `CRON_SECRET` as an encrypted Vercel Environment Variable for the target
   environment.
2. Set the server-only Google Sheets credential path/configuration supported by
   the deployment packaging strategy; a workstation-only credential file is not
   sufficient on Vercel.
3. Set the production PostgreSQL URL with an approved connection-pooling plan.
4. Confirm the service account has read access to the configured spreadsheet.
5. Confirm the Vercel plan/runtime limit is compatible with the selected sync
   duration and 15-minute schedule.
