# Production Rollback Runbook

> PHASE 6C UPDATE (2026-09-02): Recovery/mail references below are historical
> only. Rollback scope must not re-enable Resend, email recovery, or public
> recovery routes without a separately approved change.

> Phase 21 status (2026-09-01): no cutover or target write occurred, so no
> rollback action is required. The migration remains blocked at Gate B0.

Status: **DESIGN ONLY — NOT EXECUTED**

Rollback is an operator-controlled procedure. Phase 20 did not deploy, change
Supabase, change business data, disable Google Sheets, or send production mail.

## Rollback triggers

Initiate incident review for any of the following:

- authentication or authorization regression;
- dashboard KPI/data mismatch against the approved baseline;
- repeated database connection exhaustion or elevated 5xx responses;
- Google Sheets schema/identity error that could admit incorrect rows;
- duplicate or unexpected sync writes;
- password-reset delivery/security failure;
- secret exposure or untrusted deployment configuration.

## 1. Application rollback

1. Stop the release/cutover and record the deployment ID and UTC timestamp.
2. Disable or pause the Vercel production deployment through the approved
   operator path.
3. Route traffic to the last known-good deployment only after confirming it
   uses a compatible schema and environment contract.
4. Do not roll back application code while leaving an incompatible database
   migration active without an owner-approved compatibility decision.
5. Capture sanitized Vercel logs and sync status; do not copy secrets or reset
   tokens into the incident record.

## 2. Database rollback

The application does not assume reversible/down migrations. Never repair a
production database with ad-hoc `DELETE`, `UPDATE`, `TRUNCATE`, or `DROP`.

1. Stop application writes and the Google Sheets cron according to the
   approved incident procedure.
2. Preserve the latest verified backup and audit evidence.
3. Decide between restoring the target to a verified backup, restoring into a
   clean recovery project, or applying a reviewed forward migration.
4. Use a direct administrative connection for backup/restore operations, never
   the application pooler URL.
5. Validate schema, counts, relationships, units, KPI values, auth records,
   and sync registry before reopening traffic.
6. Obtain explicit approval before any production data write.

## 3. Sync rollback

- Disable the Vercel Cron schedule or make the endpoint unavailable through the
  approved deployment/configuration path.
- Do not delete imported business rows as an automatic rollback.
- Preserve `sync_runs`, `sync_row_states`, and schema-change evidence.
- Classify the affected worksheet and keep it in review/disabled state until a
  mapping decision is approved.
- Re-run idempotency and parity checks before resuming a future sync.

## 4. Auth/mail rollback

- Revert to the known-good application deployment if login/reset behavior
  regresses.
- If a secret may be exposed, rotate it through the secret manager manually;
  do not print it or commit a replacement.
- Confirm `AUTH_URL` and cookie behavior before reopening login.
- If Resend fails, keep generic reset responses and route delivery failures to
  sanitized operational logs; do not expose reset tokens.

## 5. Recovery acceptance

Recovery is complete only when:

- lint/typecheck/build of the selected release pass;
- protected route, login/logout, and role checks pass in an isolated test;
- read-only DB baseline matches the approved snapshot;
- no open schema-change review or active sync lease is unexpected;
- a controlled Google Sheets dry-run is approved and idempotent;
- password-reset URL uses the approved HTTPS origin;
- monitoring shows stable errors and connections for the observation window.

Record RPO/RTO and the final go/no-go decision in the incident/change record;
those values require the system owner and infrastructure owner.
