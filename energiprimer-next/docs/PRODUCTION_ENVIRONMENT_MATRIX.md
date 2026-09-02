# Environment Matrix — Current Contract

No actual values are recorded. `Configured` describes a local key-name/value
presence observed during the audit, not a credential that may be copied.

| Variable | Local | Preview | Production | Secret |
|---|---|---|---|---|
| `DATABASE_URL` | Isolated local endpoint | Isolated runtime endpoint | Supabase/PostgreSQL runtime endpoint | Yes |
| `SUPABASE_DIRECT_URL` | Operator-only | Operator-only | Operator/CI only | Yes |
| `SUPABASE_POOLER_URL` | Operator/runtime transport | Runtime transport as approved | Runtime transport as approved | Yes |
| `AUTH_SECRET` | Local secret | Unique preview secret | Unique production secret | Yes |
| `AUTH_TRUST_HOST` | Deliberate local value | `true` after host review | `true` after host review | No |
| `AUTH_URL` | Optional | Preview HTTPS origin | Production HTTPS origin | No |
| `CRON_SECRET` | Local secret when sync tested | Unique preview secret | Unique production secret | Yes |
| `GOOGLE_SHEETS_CREDENTIALS_PATH` | Local file fallback | Do not depend on local file | Do not depend on local file | Path/config |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Optional local pair | Required when Sheets is active | Required when Sheets is active | Yes |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Optional local pair | Required when Sheets is active | Required when Sheets is active | Yes |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Local config | Required when Sheets is active | Required when Sheets is active | Config-sensitive |
| `NEXT_PUBLIC_APP_NAME` | Optional | Optional | Optional | No |
| `NEXT_PUBLIC_APP_URL` | Public local URL | Preview URL | Public canonical origin | No |
| `DASHBOARD_DATA_SOURCE` | Optional | `postgres` | `postgres` | No |
| `AUTH_TEST_*` | Isolated test-only | Isolated test-only | Never | Yes where credential |

## Decommissioned names

`AUTH_MAILER`, `MAIL_MAILER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and
`RESEND_TEST_RECIPIENT` are removed from the active matrix. Do not provision
them for this application. Existing external values, if any, are subject to
the Phase 6C revoke/rotation gate.

## Rules

- Server secrets never use a `NEXT_PUBLIC_` prefix.
- Preview and production credentials are distinct from local and E2E values.
- `SUPABASE_DIRECT_URL` is reserved for operator checks; runtime transport must
  follow the approved pooler/runtime contract.
- This matrix does not authorize database writes, migrations, deployment, or
  credential rotation.

**Status: PASS WITH ROTATION REQUIRED.**
