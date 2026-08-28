# Dependency Audit — Phase 10

## Audit scope

Audit dilakukan terhadap `package.json`, `package-lock.json`, installed tree,
dan `npm audit --omit=dev` pada 2026-08-28. Tidak ada `npm audit fix`, force
upgrade, atau perubahan versi dependency yang dilakukan.

## Runtime and development dependencies

| Group | Packages | Assessment |
|---|---|---|
| Framework | `next@16.3.3`, `react@19.2.8`, `react-dom@19.2.8` | Installed tree consistent; local Node is `v24.17.0` |
| Authentication | `next-auth@5.0.0-beta.32`, `bcryptjs@3.0.3` | Functionally used; Auth.js beta requires pre-production regression review |
| Database | `@prisma/client@6.19.3`, `prisma@6.19.3` | Schema/read verification passes; vulnerability review remains open |
| Charts | `recharts@3.10.1`, `react-is@19.2.8` | Used by client-only chart components; no duplicate chart library |
| Server boundary | `server-only@0.0.1` | Used to protect Node-only Google Sheets/throttle modules |
| Build and lint | TypeScript `5.9.3`, ESLint `9.39.5`, `eslint-config-next@16.3.3`, Tailwind `4.3.3` | Lint, typecheck, and build pass |

`googleapis` tidak terpasang karena implementasi Google Sheets menggunakan
Node `crypto`, filesystem, dan `fetch` untuk protokol service-account JWT yang
sama. Tidak ada dependency UI atau animation baru pada Phase 10.

## `npm audit` result

Command:

```text
npm audit --omit=dev --json
```

Result: exit code `1`, dengan **3 HIGH**, **0 CRITICAL**, **0 MODERATE**, dan
**0 LOW** findings.

| Package | Severity | Affected path | Issue | Production assessment | Fix status |
|---|---|---|---|---|---|
| `deepmerge-ts@7.1.5` | HIGH | `@prisma/config` → `deepmerge-ts` | Stack exhaustion ketika menggabungkan object graph rekursif; [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | Terpasang pada dependency tree; exploitability dari input aplikasi belum dibuktikan | Audit reports a fix through Prisma `6.12.0`; changing Prisma requires review |
| `@prisma/config@6.19.3` | HIGH | `prisma` → `@prisma/config` | Membawa dependency vulnerable di atas | Berada pada installed production tree melalui Prisma client dependency | No safe patch selected |
| `prisma@6.19.3` | HIGH | Direct dev dependency and transitive installed package | Affected by the `@prisma/config` chain | CLI/config code terutama dipakai build/development, tetapi package tetap terpasang | No automatic downgrade/upgrade |

Audit tree yang terpasang menunjukkan jalur `@prisma/client` → `prisma` →
`@prisma/config` → `deepmerge-ts`. Temuan ini tidak membuktikan adanya exploit
di route aplikasi, tetapi tetap harus ditutup atau diterima secara formal
sebelum production.

## Required decision

`npm audit` melaporkan `prisma@6.12.0` sebagai fix yang tersedia, yaitu versi
lebih rendah dari versi yang sedang digunakan. Downgrade/upgrade Prisma dapat
mengubah generated client atau runtime behavior, sehingga **REQUIRES MANUAL
APPROVAL**. Jangan memakai `npm audit fix --force`.

Auth.js `5.0.0-beta.32` juga **REQUIRES MANUAL APPROVAL** untuk upgrade karena
perubahan authentication harus diikuti regression test login, logout, session,
role, dan reset password.

## Validation

- `npm.cmd ls --depth=0`: PASS, tidak ada package invalid pada installed tree.
- `npm.cmd run lint`: PASS.
- `npx.cmd tsc --noEmit`: PASS.
- `npm.cmd run build`: PASS.
- Tidak ada dependency version change pada audit ini.

## Status

**FAIL untuk dependency clearance production / NEEDS REVIEW.** Tidak ada
critical vulnerability, tetapi tiga finding HIGH dan Auth.js beta belum
diselesaikan.
