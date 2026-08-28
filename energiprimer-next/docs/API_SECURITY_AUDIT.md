# API & Server Action Security Audit

Tanggal: 2026-08-28  
Scope: route handler dan Server Action yang tersedia pada target; tidak membuat endpoint baru.

## Endpoint inventory

| Endpoint/action | Auth | Validation | Output/error | Finding |
| --- | --- | --- | --- | --- |
| /api/auth/[...nextauth] GET/POST | Auth.js managed | Auth.js credentials/CSRF handling | Auth.js response; tidak mengembalikan database object mentah | PASS WITH WARNINGS |
| authenticate | Public login action | Email non-empty/contains @, password non-empty; credential throttle di authorize | Generic invalid credential message | PASS |
| requestPasswordReset | Public, admin lookup | Email basic validation; 60-second existing-token throttle | Generic response untuk user ada/tidak ada | PASS WITH WARNINGS |
| resetPassword | Reset token | Email/token, password min 12, confirmation, expiry, bcrypt token compare | Generic invalid-token message | PASS WITH WARNINGS |
| changePassword | Server session + admin role | Current password, new password min 12, confirmation | Generic session/password error; sign-out after success | PASS |
| Dashboard/data services | Server pages only | Query filters bounded in service; no public handler | Page-level generic error states | PASS WITH WARNINGS |
| scripts/verify-*.mjs | Local operator/test only | Environment checks | CLI output; not production endpoint | PASS WITH WARNINGS |

## Security checks

- Prisma service calls occur on the server; no Client Component imports Prisma.
- Server Actions use "use server" and perform auth/role checks inside the action where required.
- password, token, password hash, access token, private key, and DATABASE_URL are not returned as API data.
- User lookup for reset is constrained to role: "admin" and returns only the required field.
- Reset token is stored hashed, expires after 60 minutes, and is deleted transactionally after success.
- Change-password action reads only the current password hash and signs the user out after update.
- Dashboard authorization is enforced in proxy and protected layout, not only by hidden navigation.
- ORM queries are parameterized; no SQL string interpolation from request input was found.
- Auth.js handles its route methods; no custom unsafe method fallback exists.

## Findings

### MEDIUM — Public reset action needs a production rate-limit policy

Reset request throttling is based on an existing token record and avoids repeated token creation for the same email during the short window. There is no independently verified IP/global rate limit for the public Server Action. This is a denial-of-service/operational risk, not an evidence of data disclosure.

Recommendation: select a rate-limit strategy compatible with Vercel and existing data architecture. Infrastructure/shared-cache changes are **REQUIRES MANUAL APPROVAL**.

### MEDIUM — Forwarded IP trust requires deployment confirmation

Login throttle derives the first x-forwarded-for value. The deployment boundary must ensure that this header is supplied by the trusted platform proxy and cannot be freely spoofed by direct clients. Confirm Vercel/network topology before relying on it for abuse prevention.

### MEDIUM — Auth.js beta regression

next-auth@5.0.0-beta.32 remains a beta dependency. Upgrade or replacement would alter authentication architecture and requires manual approval plus full regression in a disposable environment.

### MEDIUM — Explicit security headers are not configured

next.config.ts currently contains typed routes and development-origin configuration, but no explicit Content-Security-Policy, frame-ancestors/X-Frame-Options, Referrer-Policy, or Permissions-Policy headers were found. Browser defaults and hosting protections do not replace an application policy.

Recommendation: define and test a security-header policy after confirming chart assets, Auth.js callbacks, and deployment domains. This is a safe hardening candidate but was not applied because an incorrect CSP can break runtime behavior; **REQUIRES MANUAL APPROVAL** for production policy.

## IDOR and excessive data exposure review

No user-controlled numeric user ID is accepted by password-change action; it uses the authenticated session ID. Reset requires both email and a bcrypt-matched token. Data services select only fields needed by their page and convert Decimal/BigInt before presentation where required.

## Status

**PASS WITH WARNINGS.** No critical API exposure was found. Public reset rate limiting, trusted proxy configuration, and Auth.js beta lifecycle remain NEEDS REVIEW.
