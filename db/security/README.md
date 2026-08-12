# Security proof-of-concept — public/admin DB boundary

This proves the **DB-enforced** public/admin boundary from ADR-3D.3 (A2/C15):
the public data client connects as a least-privilege role `app_public` that
can read only the `v_public_*` views and **cannot** read base tables or the
ungated `v_current_*` fact views.

## Why this matters

Even if public application code has a bug, it physically cannot obtain
internal/unverified data, because the database credential it holds has no
privilege on base tables. The public-eligibility rules (Phase 3C / 3D.1) are
therefore enforced by the database, not merely by application logic.

## How it works (PostgreSQL mechanism)

A normal (non-`security_invoker`) view accesses its underlying relations with
the privileges of the **view owner**, not the caller. So `app_public`, granted
`SELECT` on `v_public_holder` only, reads eligible rows through the view
**without** any base-table grant — and a direct `SELECT` on a base table is
rejected with `42501 insufficient_privilege`.

## Run it

```bash
# fresh DB: schema + seed + roles/grants + security tests
PGDATABASE=setda_sec ./db/security/run_security_poc.sh
```

Expected: `SEC 1..5 PASS` and `>> SECURITY POC GREEN`.

## Scope & the one Supabase-specific caveat

This POC runs on stock PostgreSQL 16. Supabase uses stock PostgreSQL, so the
**role + grant + view-owner semantics are identical**. The only thing this POC
**cannot** prove without a real Supabase project is whether the **Supavisor
connection pooler** accepts a custom `LOGIN` role (here the roles are `NOLOGIN`
and proven via `SET ROLE`).

**To verify on real Supabase before production:** create `app_public` /
`app_admin` as `LOGIN` roles, connect through the pooler as `app_public`, and
run the same assertions. If the pooler cannot authenticate a custom role,
**do not change any Phase 3C business rule** — fall back to the closest
documented Supabase pattern (trusted server-side connection restricted to the
public views, and/or RLS on the Data API), and record it as a CONFLICT/OPEN.
Do not add RLS reflexively: if the role+view boundary holds, RLS is redundant
complexity for this design.
