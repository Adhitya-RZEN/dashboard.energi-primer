# Production Environment — Current Contract

Actual production values are intentionally omitted. Provision them only in a
managed secret store or the platform environment configuration.

| Variable | Boundary | Production use |
|---|---|---|
| `DATABASE_URL` | Server | Supabase/PostgreSQL runtime connection |
| `AUTH_SECRET` | Server | Auth.js JWT signing; unique to production |
| `AUTH_TRUST_HOST` | Server | Explicit deployment host trust |
| `AUTH_URL` | Server | Canonical HTTPS Auth.js origin |
| `CRON_SECRET` | Server | Scheduled sync bearer authorization |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Server | Google Sheets service identity |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Server | Google Sheets service credential |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Server | Workbook identity |
| `GOOGLE_SHEETS_CACHE_TTL` | Server | Optional cache tuning |
| `NEXT_PUBLIC_APP_NAME` | Client-safe | App branding |
| `NEXT_PUBLIC_APP_URL` | Client-safe | Public canonical origin |

`SUPABASE_DIRECT_URL` and `SUPABASE_POOLER_URL` are operator/transport
configuration, not public browser configuration. A local credential-file path
may be used during local development but must not be assumed to exist on
Vercel.

## Decommissioned provider configuration

The application no longer provisions or reads `AUTH_MAILER`, `MAIL_MAILER`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, or `RESEND_TEST_RECIPIENT`. Email-based
account recovery and its public routes are decommissioned. Any old provider
secret found in an external environment must be revoked by the operator after
dependency confirmation.

## Production rules

- Keep runtime, direct/operator, preview, local, and E2E database credentials
  separate.
- Do not run Prisma migration commands as part of build or deployment unless a
  separately approved migration change authorizes it.
- Never expose a server secret through `NEXT_PUBLIC_*` or client props.
- Rotate `AUTH_SECRET`, database credentials, `CRON_SECRET`, Google credentials,
  and any exposed E2E credentials before release according to the Phase 6C
  rotation gate.

## Status

**PASS WITH ROTATION REQUIRED:** configuration contract is current; actual
secret provisioning, key revocation, and platform log review remain operator
actions.
