# ADR-3D.4 — Vertical Slice-1 (Pimpinan): implementation + security proof

**Status:** IMPLEMENTED — all checks green locally · **Scope:** `/pimpinan`, `/pimpinan/[slug]` end-to-end on the dev environment, per ADR-3D.3.
**Order followed (as mandated):** security proof → data path → services → UI → tests → CI.

## What was proven, on a real PostgreSQL 16

1. **Security POC (`db/security/`) — GREEN.** With roles `app_public` / `app_admin`:
   - `app_public` reads `v_public_holder` / `v_public_eligibility` / `v_public_unit` / `v_public_pimpinan`.
   - `app_public` is **DENIED (`42501`)** on `persons`, `assignments`, `verifications`, `organization_units`, `positions`, **and** on the ungated `v_current_*` views.
   - `v_public_holder` exposes **exactly** the eligible holders (3 in seed).
   - Verified again at the connection level: the live app connects as `app_public` and gets `permission denied for table persons`.
2. **App integration (13 vitest tests) — GREEN.** Public boundary, RBAC (Publish ≠ Verify), DB-enforced assignment overlap, verification→revalidate.
3. **E2E (3 Playwright tests) — GREEN.** Browser → Next SSR → `app_public` → `v_public_pimpinan` → PostgreSQL renders the three officials; position page shows the current holder; unknown slug → 404.

## Key implementation facts

- **Runtime:** Next.js 14 (App Router) + TypeScript, modular monolith.
- **Data layer:** Kysely over `postgres.js` (`prepare:false` for the Supabase pooler). Types are **separated** — the public client is typed to views only, so a base-table read is not even expressible. Migrations stay hand-written SQL (`db/migrations/*.sql`); Kysely never owns schema.
- **Public read boundary:** pages read only through `v_public_pimpinan` (a new **additive presentation view**, migration `0004`, that decorates the LOCKED `v_public_holder` — no resolver changed). Eligibility is never recomputed in TypeScript.
- **Currentness-safe cache:** read models use `unstable_cache` tagged `pimpinan` / `pimpinan:<slug>`; services call `revalidateTag(...)` on eligibility-affecting writes → no stale officeholder.
- **AuthZ:** app-level RBAC over the 3D.1 tables; `verifier` may verify, `publisher` may not (Publish ≠ Verify). **AuthN** is a pluggable Identity port (Supabase adapter default), separate from AuthZ.
- **DB constraints as truth:** services catch `exclusion_violation` etc. and map to domain errors; overlap is never re-implemented in TS.

## New / additive migrations (no domain table added; domain stays 19 tables)

- `0002_roles_grants.sql` — `app_public` / `app_admin` roles + least-privilege grants.
- `0003_users_external_auth_id.sql` — additive column for Auth→users mapping.
- `0004_public_read_views.sql` — additive `v_public_pimpinan` presentation view + grant.

## 3D.4 findings

- **F1 — `kysely-postgres-js` used as the driver dialect.** The ADR chose Kysely over postgres.js; the concrete dialect is `kysely-postgres-js@2` (verified importable/typed). No design change.
- **F2 — Supabase-pooler caveat still OPEN.** The POC proves the PostgreSQL role/view mechanism (identical engine on Supabase). Whether the **Supavisor pooler** authenticates a custom `LOGIN` role must be verified on a real Supabase project; fallback documented in `db/security/README.md`. **No 3C business rule may change to accommodate it.**
- **F3 — Auth JWT verification not exercised** in the sandbox (no live Supabase). The Identity port + Supabase adapter are in place; real JWT verification (jose + `SUPABASE_JWT_SECRET`) is wired when a project exists. RBAC/services were tested directly with known user ids.

## No CONFLICT with LOCKED decisions

No Phase 3C business rule, resolver, or domain-model shape was changed. All additions are additive infra (roles/grants, one column, one presentation view) or application code that consumes the existing views/constraints.

## Local green summary

`db/run_slice1.sh` ✓ · `db/security/run_security_poc.sh` ✓ · `npm run lint` ✓ · `npm run typecheck` ✓ · `npm run test` (13) ✓ · `npm run build` ✓ · `npx playwright test` (3) ✓. CI (`.github/workflows/ci.yml`) runs the same order on a fresh PostgreSQL service.
