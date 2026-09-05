# Google Sheets Sync Scheduler

> CURRENT PRODUCTION OPERATIONAL CONTRACT (2026-09-05): Phase 6K verified
> the Production deployment and Phase 6L verified exactly one authorized
> controlled sync with HTTP 200, status SUCCESS, syncRun ID 2, and no observed
> P2028. The exact seven-source policy and the 22:00 UTC schedule below are
> current. Phase 6J deployment-pending language is historical.

> **Phase 6J update (2026-09-04):** The local sync path now acquires the
> source lease before the worksheet registry snapshot and uses short,
> set-oriented discovery persistence. The user deploys manually; no deployment
> or Production sync is performed by the agent in Phase 6J.

Historical Phase 6J checkpoint: **local implementation; manual deployment verification pending**

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
0 22 * * *  → /api/sync/google-sheets (06:00 WITA daily)
```

The cron invocation uses scope `automatic`. Discovery first reads the workbook
metadata, bootstraps the source, acquires its lease, snapshots the registry, and
registers new tabs by their stable Google `sheetId`. The importer
then admits only the preferred worksheet for each period when all of these
conditions hold:

1. the title is a valid, case-insensitive BB period name such as
   `Agustus26-BB` or `September26-BB`;
2. the period is after the approved `Juli26-BB` boundary and is not later than
   the current UTC operational period;
3. its semantic schema fingerprint exactly matches the approved `Juli26-BB`
   schema; and
4. it passes the existing parser/import validation and duplicate stable-key
   checks.

Therefore a newly added `Agustus26-BB` tab is discovered and processed by the
next authorized cron invocation once August is due. A future-dated tab,
unrelated tab, duplicate period title, or schema-drifted tab is registered but
not imported automatically. A schema-review state must be resolved explicitly
before that worksheet can re-enter the automatic path. Historical/backfill
synchronization remains a separately controlled operation and is not triggered
 by arbitrary request parameters.

The registry may contain all 199 metadata worksheets. That inventory is not the
required monthly BB processing set. The required business source set is exactly
`Januari26-BB`, `Februari26-BB`, `Maret26-BB`, `April26-BB`, `Mei26-BB`,
`Juni26-BB`, and `Juli26-BB`; non-required tabs remain retained metadata.

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
manual. Scope `automatic` adalah kebijakan scheduler yang digunakan route
terproteksi; jangan menjalankan backfill penuh sebagai pengganti cron.

For a future environment change, the route must be tested in a local server
with a test-only `CRON_SECRET`. The current schedule is daily at 22:00
UTC (06:00 WITA), not the historical 15-minute schedule described by Phase 17.

## Historical Phase 6J deployment and sync approval boundary

After local gates and disposable PostgreSQL write tests pass, the USER performs
the reviewed Vercel deployment manually. The agent must not change
`vercel.json`, environment variables, secrets, or the Cron schedule. Deployment
does not authorize a Production sync: a new explicit Production sync approval
is required, and post-deployment checks remain read-only until that approval.

## Historical Vercel configuration checklist

The current Production configuration was verified in Phase 6K and the
controlled sync result was verified in Phase 6L. Any later change to
environment variables, credentials, Cron, database endpoints, or source
policy requires a separate reviewed approval and post-change verification.

1. Set `CRON_SECRET` as an encrypted Vercel Environment Variable for the target
   environment.
2. Set the server-only Google Sheets credential path/configuration supported by
   the deployment packaging strategy; a workstation-only credential file is not
   sufficient on Vercel.
3. Set the production PostgreSQL URL with an approved connection-pooling plan.
4. Confirm the service account has read access to the configured spreadsheet.
5. Confirm the Vercel plan/runtime limit is compatible with the selected sync
   duration and daily schedule.
