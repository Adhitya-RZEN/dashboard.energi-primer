# Google Sheets Sync Hardening

Status checkpoint: **S7 PASS WITH WARNINGS**

## Security boundary

- Google client module is marked `server-only` and uses Node crypto/filesystem
  APIs only on the server.
- PostgreSQL/Prisma calls are isolated from Client Components.
- Cron requests require a constant-time Bearer secret comparison.
- Request parameters cannot override spreadsheet, worksheet, range, or database
  target.
- API response contains aggregate counters only.
- Error categories are sanitized; credentials and arbitrary exception text are
  not returned or logged.
- No new dependency was added for synchronization; the existing native REST
  client remains in use.

## Credential deployment hardening

Local development may use `GOOGLE_SHEETS_CREDENTIALS_PATH` pointing to an
ignored service-account JSON file. Vercel/serverless deployment can instead use
the server-only pair:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`;
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

The private key is normalized from escaped `\\n` to newline at runtime. The
actual value must be entered through the deployment secret manager and is never
committed, documented, returned, or printed. The two variables must be supplied
together; partial configuration fails fast.

## Performance controls

- Metadata and range reads use the existing bounded in-memory TTL cache.
- Cron scope is the automatic future-BB policy: it admits only due worksheets
  after `Juli26-BB` whose schema matches the canonical July snapshot. It does
  not run a full historical backfill on every scheduled invocation.
- The parser runs on the server before normalized data is passed to the existing
  transactional importer.
- Google network calls are outside the database transaction.
- Source lease prevents duplicate concurrent cron work.
- Lease renewal occurs before each worksheet to protect long-running backfills.
- Dashboard charts do not call the sync endpoint or Google Sheets directly.
- Existing Prisma singleton reuse remains in place for development/serverless
  module reuse.

## Data safety controls

- No destructive migration, `db push`, or delete propagation is used.
- Schema changes are blocked for review before normalized writes.
- Duplicate stable source keys are blocked.
- A failed importer transaction does not advance row state.
- Source rows missing from a later read are retained until an explicit archive
  policy is approved.
- New BB worksheet admission is gated by period, canonical schema fingerprint,
  parser validation, and duplicate stable-key detection. A new tab is
  registered automatically, but a schema-drifted or future-dated tab remains
  in review/not-due state and is not imported.
- Stable row identity excludes spreadsheet row number and cell address. The
  normalized worksheet content hash is used for change detection; unchanged
  rows are `SKIP` and are excluded from the import write plan.
- Import plans carry a deterministic checksum. A completed successful sync
  import with the same source, worksheet, range, periods, and checksum is
  reused instead of creating another normalized import transaction.
- Manual/verification sync remains local-only unless an authenticated scheduler
  explicitly opts into a non-local target.

## Remaining operational warnings

1. The range cache is process-local and is not a durable distributed cache. The
   database row state remains the idempotency source of truth.
2. The six historical worksheets January-June 2026 currently have imported
   domain data but do not have persisted sync row states/schema approval in the
   existing registry. They must not be presented as fully idempotent until a
   separately approved registry reconciliation is completed.
3. Existing normalized importer upserts are sequential inside a transaction.
   This is safe for the current workbook size but should be load-tested before
   expanding historical backfills.
4. The import-run table has no unique checksum constraint. The source lease
   protects the normal sync orchestrator; direct concurrent importer calls
   still require operational serialization or a future additive constraint
   review.
5. Mapping profile/version and a first-class `SYNCED`/`BLOCKED` worksheet state
   are currently code/derived concepts, not separate persisted columns. Adding
   them would require a reviewed schema change.
6. Production PostgreSQL pooler/connection limits must be selected for the
   Vercel plan. Changing infrastructure requires manual approval.
7. Alert delivery for failed/partial runs is not configured; monitoring state is
   available in PostgreSQL and the protected monitoring page.

## Verification

```bash
npm run sync:verify-config
npm run sync:verify-cron-auth
npm run sync:verify-auto-admission
npm run sync:verify-retry -- --live
npm run sync:verify-schema -- --live
npm run sync:verify-incremental -- --live
```

All live commands above use the local environment/database only. Production
credential and database validation remain a deployment-stage manual check.
