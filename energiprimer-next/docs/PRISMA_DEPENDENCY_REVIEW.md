# Prisma Dependency Review

Tanggal: 2026-08-28  
Scope: investigasi advisory dependency tanpa auto-fix atau version change.

## Commands

    npm audit --omit=dev --json
    npm ls prisma --all
    npm ls @prisma/client --all

npm audit --omit=dev --json selesai dengan exit code 1 dan melaporkan 3 HIGH, 0 CRITICAL, 0 MODERATE, dan 0 LOW.

## Findings

| Package        | Current | Severity | Root Cause                                                                     | Fix Available                                                               | Action                                            |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------- |
| deepmerge-ts   | 7.1.5   | HIGH     | Recursive object graph dapat menyebabkan stack exhaustion; GHSA-ggr8-5vv4-36mx | Audit reports Prisma 6.12.0 sebagai fix candidate                           | **REQUIRES MANUAL APPROVAL**; tidak diubah        |
| @prisma/config | 6.19.3  | HIGH     | Membawa deepmerge-ts vulnerable                                                | Terpengaruh oleh fix Prisma yang dilaporkan                                 | Review release/compatibility Prisma secara manual |
| prisma         | 6.19.3  | HIGH     | Direct dev dependency dan bagian installed dependency tree                     | Tool melaporkan 6.12.0, lebih rendah dari current dan ditandai semver-major | Jangan downgrade/upgrade otomatis                 |

Dependency path pada installed tree:

    @prisma/client@6.19.3
    └─ prisma@6.19.3
       └─ @prisma/config@6.19.3
          └─ deepmerge-ts@7.1.5

npm ls prisma --all dan npm ls @prisma/client --all berhasil serta tidak menunjukkan invalid direct package. Advisory menunjukkan package/config path yang terpasang; exploitability pada route aplikasi belum dibuktikan, tetapi tidak boleh diabaikan sebelum production sign-off.

## Compatibility assessment

- Prisma schema dan generated client saat ini lulus validation/build.
- Downgrade ke 6.12.0 dapat mengubah generated client, engine, atau behavior dan tidak dianggap safe patch.
- Upgrade Prisma/Auth.js bersamaan akan memperbesar area regression.
- Tidak dijalankan npm audit fix, npm audit fix --force, downgrade, atau major upgrade.

## Recommendation

Pemilik proyek perlu memilih versi Prisma yang telah diperiksa release note dan kompatibilitasnya, kemudian menjalankan regression lint, typecheck, build, read-only DB verification, dan authentication test pada environment aman. Keputusan tersebut adalah **REQUIRES MANUAL APPROVAL**.

## Status

**FAIL untuk dependency clearance production / NEEDS REVIEW.** Tidak ada perubahan dependency pada Phase 10A.
