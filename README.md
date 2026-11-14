# Sekretariat Daerah Kota Tarakan — portal (`setda.tarakankota.go.id`)

Official portal for the Regional Secretariat (Setda) of Kota Tarakan. Built
database-first: PostgreSQL owns the business rules; the application consumes
them. See `docs/adr/` for the full decision trail (Phase 3C → 3D.4).

**Vertical Slice-1 (Pimpinan)** is implemented end-to-end: `/pimpinan` and
`/pimpinan/[position-slug]`.

## Stack

Next.js 14 (App Router) · TypeScript · Kysely over postgres.js (SQL-first) ·
PostgreSQL 16 (Supabase as the managed provider for dev/pilot). Public reads go
only through `v_public_*` views via a least-privilege `app_public` role.

## Prerequisites

- Node 20+
- PostgreSQL 16 with `btree_gist` (Supabase provides this)

## Quick start (local dev)

```bash
# 1) point libpq at your Postgres (or use a local instance)
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres

# 2) create the dev DB: migrate + seed + dev login roles
PGDATABASE=setda_app bash db/reset-dev.sh

# 3) configure the app
cp .env.example .env.local   # points APP_*_DB_URL at setda_app

# 4) install + run
npm install
npm run dev                  # http://localhost:3000/pimpinan
```

## Checks (what CI runs)

```bash
bash db/run_slice1.sh                        # DB resolver tests (10 + RBAC)
PGDATABASE=setda_sec bash db/security/run_security_poc.sh  # public/admin boundary
npm run lint && npm run typecheck
npm run test                                 # unit + integration
npm run build
npm run test:e2e                             # Playwright (needs a built app + DB)
```

## Layout

```
app/            Next.js App Router (public pages)
src/db/         SQL-first data layer (public/admin clients, read models over views)
src/rbac/       application-level authorization over the RBAC tables
src/auth/       pluggable Identity port (Supabase adapter default)
src/domain/     services (transactions; DB constraints are the safety net)
db/             canonical schema (SQL migrations), seed, tests, security POC
docs/adr/       architecture decision records (3C → 3D.4)
```

## Deployment note

Vercel Hobby + Supabase Free are **dev/pilot only**. Production hosting, SSO,
data residency/PDN, and backups are OPEN decisions (see
`docs/adr/ADR-3D.2-amendment-vercel-supabase.md`). The design is portable by
intent — moving PostgreSQL or host is configuration, not a rewrite.
