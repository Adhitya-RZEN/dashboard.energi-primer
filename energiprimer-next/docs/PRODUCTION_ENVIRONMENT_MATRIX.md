# Production Environment Matrix

No actual values are recorded here. Statuses describe configuration classes
only; secret values remain in the local/deployment secret manager.

| Variable | Local | Preview | Production | Source | Secret |
|---|---|---|---|---|---|
| `DATABASE_URL` | Configured; loopback PostgreSQL | Supabase approved URL required | Supabase pooler/direct decision required | `.env.local` / Supabase / Vercel | Yes |
| `NEXT_PUBLIC_APP_NAME` | Configured | Optional | Optional | `.env.example` / Vercel | No |
| `NEXT_PUBLIC_APP_URL` | Configured local public URL | Preview URL if needed | Public canonical origin only | `.env.example` / Vercel | No |
| `DASHBOARD_DATA_SOURCE` | Optional; unset defaults to PostgreSQL | `postgres` | `postgres` | `.env.example` / Vercel | No |
| `AUTH_SECRET` | Configured local | Unique preview secret required | Unique production secret required | `.env.local` / Vercel | Yes |
| `AUTH_TRUST_HOST` | Configured | `true` after host review | `true` after host review | `.env.example` / Vercel | No |
| `AUTH_URL` | Not configured locally | Preview HTTPS origin | Production HTTPS canonical origin required | `.env.example` / Vercel | No |
| `CRON_SECRET` | Configured local | Unique preview secret required | Unique production secret required | `.env.local` / Vercel | Yes |
| `AUTH_MAILER` | Configured local mode | `resend` only when verified | `resend` when reset mail is enabled | `.env.example` / Vercel / Resend | No |
| `RESEND_API_KEY` | Configured locally; provider not production-verified | Preview key required for real mail test | Production key required | `.env.local` / Resend / Vercel | Yes |
| `RESEND_FROM_EMAIL` | Configured locally; sender review pending | Verified preview sender required | Verified production sender required | `.env.local` / Resend / Vercel | Config-sensitive |
| `RESEND_TEST_RECIPIENT` | Optional test-only | Controlled test-only | Must not be required by runtime | `.env.example` / operator | No |
| `GOOGLE_SHEETS_CREDENTIALS_PATH` | Configured local file fallback | Do not depend on local file | Do not configure as runtime dependency | `.env.local` / local only | Path/config |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Environment pair absent; file fallback available | Required | Required | `.env.example` / Google Cloud / Vercel | Yes |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Environment pair absent; file fallback available | Required | Required | `.env.example` / Google Cloud / Vercel | Yes |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Configured locally | Required | Required | `.env.local` / Google Cloud / Vercel | Config-sensitive |
| `GOOGLE_SHEETS_CACHE_TTL` | Configured | Optional, reviewed | Optional, reviewed | `.env.example` / Vercel | No |
| `MAIL_MAILER` | Legacy fallback only | Deprecated; prefer `AUTH_MAILER` | Do not rely on it | Laravel compatibility/source | No |
| `AUTH_TEST_BASE_URL` | Test-only, currently unavailable | Isolated test-only | Never | test script | No |
| `AUTH_TEST_ADMIN_EMAIL` | Test-only, currently unavailable | Isolated test-only | Never | test script | Yes |
| `AUTH_TEST_ADMIN_PASSWORD` | Test-only, currently unavailable | Isolated test-only | Never | test script | Yes |
| `AUTH_TEST_SECRET` | Test-only, currently unavailable | Isolated test-only | Never | test script | Yes |
| `NODE_ENV` | Framework-managed | Vercel-managed | Vercel-managed | Next.js/platform | No |

## Rules

- `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, Resend key, and Google private
  key are server-only.
- No secret uses a `NEXT_PUBLIC_` prefix.
- `.env.example` contains placeholders only; `.env.local` and `credentials/`
  remain ignored.
- `AUTH_TEST_*` must use a non-production account/database and must never be
  copied to production.
- The production source of truth is PostgreSQL/Supabase. Google Sheets is used
  by the server-side importer/synchronizer, not by browser components.
