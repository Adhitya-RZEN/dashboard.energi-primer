# Production Smoke Test Plan

> PHASE 6C UPDATE (2026-09-02): Do not test or provision the former Resend or
> public recovery flow. Authentication smoke tests cover Auth.js Credentials,
> protected access, logout, and role enforcement with an isolated account.

Status: **PLAN ONLY — NOT EXECUTED AGAINST PRODUCTION**

Run this plan first in a non-production Preview environment with isolated
credentials and a database snapshot. Any test that can write authentication,
sync, or business data requires explicit approval and a controlled test target.

## Preconditions

- Vercel Preview Root Directory is `energiprimer-next`.
- Preview environment variables are configured without exposing values.
- Preview database is disposable or an approved snapshot.
- Google service account has read access only for the initial read-only test.
- Resend sender/domain is verified if a real email test is approved.
- `AUTH_TEST_*` values, if used, are isolated and never production values.

## Automated checks

Run from `energiprimer-next`:

```text
npm ci
npm run lint
npx tsc --noEmit
npm run build
npm audit
git diff --check
```

Also run the existing read-only/static checks: database verification, auth
security verification, cron-auth verification, Google config verification,
sync state verification, schema detection, retry, idempotency, and dynamic
parser checks. `npm test` is not available unless a test script is added in a
separate approved change.

## Functional matrix

| Area | Test | Expected result |
|---|---|---|
| Availability | Open `/login`, `/forgot-password`, and the dashboard URL | No stack trace or secret in response |
| Login | Invalid email/password | Generic failure; no account enumeration |
| Login | Valid isolated admin account | Session created; no password/hash in response |
| Authorization | Direct request as unauthenticated user | Redirect/deny protected route |
| Authorization | Non-admin isolated account, if available | Server-side deny; hidden navigation is not the control |
| Logout | Submit logout action | Session invalidated and protected route denied |
| Reset request | Existing and unknown admin emails | Same generic response; rate limit behaves as documented |
| Reset delivery | One approved recipient only | HTTPS reset URL, expiry, single-use invalidation, no token logs |
| Dashboard | Overview, Biomassa, Batubara, Solar, Stok, Target | KPI/data source and units match baseline |
| Filters | Month/year/day and reset | URL/cookie filter behavior preserved; no full document error |
| Charts | Tooltip, legend, point/bar selection, responsive layout | Data points and values match server-provided data |
| Cron auth | Missing/wrong bearer | 401/503 as configured; no sync action |
| Google read | One approved worksheet/range read | Canonical parser/mapping passes; no credential in output |
| Sync write | Controlled approved run only | Idempotent counts and audit rows match plan; never run in Phase 20 |
| Database | Read-only baseline script | No orphan, expected counts, business writes remain zero during smoke |

## Dashboard route checklist

Verify the existing route set:

`/dashboard`, `/dashboard/biomassa`, `/dashboard/batubara`,
`/dashboard/solar`, `/dashboard/stok`, `/dashboard/target`,
`/data-batu-bara`, `/monitoring`, `/laporan`, and `/pengaturan`.

## Stop conditions

Stop immediately for a non-generic error, unexpected write, KPI mismatch,
missing unit, schema review, active lease left behind, 5xx spike, failed
authentication boundary, or any output containing a secret/token.

## Evidence

Record only sanitized status, deployment ID, test timestamp, route status,
row-count deltas, error category, and owner approval. Never record passwords,
private keys, API keys, access tokens, full URLs containing tokens, or complete
database connection strings.
