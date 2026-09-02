# Supabase Auth E2E Login Diagnosis — 2026-09-02

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): This diagnosis is retained
> for evidence and does not define active authentication configuration.

## Status

`DIAGNOSED`

Primary root cause: `PLAYWRIGHT_SUBMIT_RACE`.

Secondary blocker found after hydration was allowed to complete: Supabase Auth returned HTTP `400` for the test login request. The response indicates that the E2E login account/configuration still needs manual verification, but no credential value was read or recorded.

## Scope and Safety

- `.env.local` was not read.
- No provisioning script was run.
- No user, password, `app_metadata`, public table, or business data was changed.
- No database write was performed: `0`.
- No Production Supabase access was performed.
- No deployment was performed.
- Service-role key, password, token, and credential values were not used in the browser context or written to this report.

## Source Audit

| Area | Evidence |
| --- | --- |
| Login component | `src/app/login/LoginForm.tsx:1` is a Client Component. |
| Form handler | `src/app/login/LoginForm.tsx:16-17` defines `handleSubmit` and calls `event.preventDefault()`. |
| Supabase login | `src/app/login/LoginForm.tsx:28-30` creates the browser client and calls `signInWithPassword`. |
| Success behavior | `src/app/login/LoginForm.tsx:47-48` replaces the route with `/dashboard` and refreshes it. |
| Browser client | `src/lib/supabase/client.ts:9-15` lazily creates one browser client from the public Supabase configuration. |
| Public configuration | `src/lib/supabase/config.ts:2-3` reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| Playwright login | `e2e/supabase-auth.spec.ts:19-29` navigates, waits only for visible SSR UI, fills fields, and clicks immediately. |
| Web server | `playwright.config.ts:114-120` starts the managed Next server and waits for its local URL. |
| E2E environment | `scripts/run-e2e-with-env.mjs:185-224` validates the non-production marker, E2E Supabase URL, local base URL, public Supabase URL, and PostgreSQL URL before starting children. |

There is no explicit client-mounted/React-ready state in `LoginForm`. The submit button is enabled initially; it is disabled only after the handler has started and `pending` becomes true.

## Diagnostic Evidence

### Baseline test (no temporary delay)

- The page and form were visible.
- The click caused a native navigation back to `/login` with submitted form fields in the query string. The field values were not recorded in this report.
- No `/auth/v1/*` Supabase request occurred.
- No application `pageerror` or JavaScript console error was observed.
- The test timed out waiting for `/dashboard`.

This proves that the React `onSubmit` handler had not taken control of the submit at the time of the Playwright click. Visibility of the SSR form was not sufficient evidence that hydration had completed.

### Controlled hydration-timing diagnostic

A temporary 3-second wait was added only for diagnosis and then removed.

- The same login interaction then produced `POST /auth/v1/token`.
- Supabase responded with HTTP `400`.
- This proves the browser client and React submit handler became active after the wait.
- The temporary diagnostic did not log request bodies, response bodies, tokens, or credentials.

## Root-Cause Classification

| Category | Result | Explanation |
| --- | --- | --- |
| `LOGIN_HANDLER_NOT_HYDRATED` | Observed symptom | The immediate click happened before the client handler controlled the form. |
| `SUPABASE_CLIENT_NOT_READY` | Not primary | The client is lazy-created in the handler and successfully sent a request in the controlled run. |
| `E2E_ENV_NOT_REACHING_BROWSER` | Not indicated | E2E guards passed and the browser reached the E2E Supabase Auth endpoint. |
| `PLAYWRIGHT_SUBMIT_RACE` | **Primary** | Adding only a hydration wait changed behavior from native GET to Supabase Auth POST. |
| `APPLICATION_LOGIN_BUG` | Not proven | The source handler is correct and became active in the controlled run. |
| `UNKNOWN` | No | The primary behavior is reproducible and timing-sensitive. |

## Secondary Auth Finding

After the hydration race was bypassed diagnostically, the Auth request returned HTTP `400`. This is a separate issue from form hydration. The safe conclusion is:

`E2E_AUTH_LOGIN_REJECTED — manual account/configuration verification required`

Possible causes include a mismatch between the test environment's login variables and the existing E2E Auth user, or an E2E Auth configuration rejection. This cannot be distinguished safely without reading or exposing secret values, and provisioning is explicitly out of scope for this phase.

## Recommended Minimal Fix

Do not change Supabase Auth, route protection, proxy authorization, or production authentication behavior.

1. Add a deterministic readiness signal for the login form, or use an existing application-ready signal if one is introduced by the application owner.
2. Make the Playwright helper wait for that readiness signal before filling/submitting. A fixed `waitForTimeout` should not be the permanent solution.
3. Separately verify, through the isolated E2E operator path, that the test login variables correspond to the existing confirmed E2E admin account. Do not print the values and do not run provisioning as part of this diagnosis.
4. Only after those checks, rerun the full five-test suite.

No fix was implemented in `LoginForm` or in the test semantics during this diagnosis.

## Validation

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| E2E diagnostic login | Executed once with temporary diagnostics and once with temporary hydration wait; no writes |
| Provisioning | NOT RUN |
| Database writes | 0 |
| Production access | 0 |

## Final Conclusion

`STATUS: DIAGNOSED`

The original native navigation is caused by a Playwright submit race against client hydration (`PLAYWRIGHT_SUBMIT_RACE`). The controlled run also exposed a separate HTTP `400` Auth rejection that must be manually verified in the isolated E2E environment. The temporary diagnostic code and wait were removed after the tests.

## Phase 22E.4 Resolution Update

The readiness fix was implemented without changing Supabase Auth, route protection, authorization, or credentials:

- `src/app/login/LoginForm.tsx` now uses `useSyncExternalStore` to expose a deterministic server/client readiness state;
- the form exposes `data-auth-ready="true"` only after client hydration is ready;
- the login button is disabled before readiness and while the request is pending;
- `e2e/supabase-auth.spec.ts` waits for the readiness marker and enabled login button;
- no arbitrary delay is used.

### Verification

The full suite ran after the fix:

| Check | Result |
| --- | --- |
| Tests discovered | 5 |
| Passed | 1 |
| Failed | 4 |
| Skipped | 0 |
| Native form navigation | No longer observed |
| Login route transition | Reached `/dashboard` in login-dependent tests |
| Auth credential rejection | Not reproduced as the current blocker |
| Dashboard assertion | Failed because the page rendered `OverviewErrorState` |
| Lint | PASS |
| TypeScript | PASS |
| Provisioning | NOT RUN |
| Database writes | 0 |
| Production access | 0 |

The previous diagnostic HTTP `400` finding is retained as historical evidence from before the readiness fix. In the latest full run, the login handler completed enough to reach the protected dashboard and render the authenticated application shell. The current blocker is therefore dashboard data loading in the E2E database/runtime, not the hydration race or a confirmed credential failure.

No database or source-data fix was attempted in this phase. The E2E database/read path must be audited separately before changing any data or schema.
