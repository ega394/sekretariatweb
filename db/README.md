# Database — Phase 3D.1: Vertical Slice 1 (Pimpinan)

Portal Resmi Sekretariat Daerah Kota Tarakan — `setda.tarakankota.go.id`

This directory contains the **first real database slice**, built to prove the
LOCKED Phase 3C content model + relevant Phase 3D physical spec against a real
PostgreSQL instance — **before** building any application or UI.

Scope is deliberately narrow: everything needed for the pages
`/pimpinan` and `/pimpinan/:position-slug` (e.g. `/pimpinan/sekretaris-daerah`)
and **nothing else**. Agenda, News, Announcement, Document, Media, SitePage and
ExternalChannel tables are intentionally **not** created yet.

## Files

| File | Purpose |
|------|---------|
| `migrations/0001_slice1_pimpinan.sql` | Schema: tables, enums, reference tables, constraints, indexes, resolver views, RBAC. |
| `seed/0001_slice1_seed.sql` | **Confirmed** baseline data only (kept separate from schema). |
| `tests/0001_slice1_tests.sql` | 10 scenario tests + 1 RBAC test, run in a rolled-back transaction. |
| `run_slice1.sh` | Applies schema + seed, then runs the tests. |

## Requirements

- PostgreSQL **16+**
- Extension `btree_gist` (used by the assignment overlap `EXCLUDE` constraints)
- `gen_random_uuid()` from core (no extension needed)

## Run

```bash
# point libpq at your throwaway Postgres, then:
PGDATABASE=setda ./db/run_slice1.sh
```

The runner **drops and recreates** the target database, so use a scratch DB.
Expected tail output: `>> Slice-1 GREEN` with `TEST 1..10 PASS` and `BONUS PASS`.

## What the slice proves (all green)

| # | Scenario | Rule proven |
|---|----------|-------------|
| 1 | verified + current | full chain → `v_public_holder` shows the person |
| 2 | unverified person | not public; no public holder |
| 3 | assignment expired | drops out of `v_current_holder` |
| 4 | assignment ended | person **stays** verified (identity ≠ tenure — C2-1) |
| 5 | two substantive overlap | rejected by DB (`EXCLUDE`) |
| 6 | two acting overlap | rejected by DB (`EXCLUDE`) |
| 7 | acting + substantive overlap | allowed |
| 8 | acting current but unverified | no public holder; **no fallback** to substantive (C2-3) |
| 9 | parent unit unverified | child not public (cascading eligibility — C2-2) |
| 10 | full chain verified | public holder appears |
| — | RBAC | `verifier` can verify; `publisher` cannot → **Publish ≠ Verify** |

## Key design realizations (Phase 3C → physical)

- **Person / Position / OrganizationUnit / Assignment** are separate; a person
  changing office touches only `assignments` (temporal bridge).
- **`CURRENT_HOLDER` ≠ `PUBLIC_HOLDER`**: `v_current_holder` is fact-only
  (no verification/publication); `v_public_holder` adds the full eligibility
  chain with **no acting→substantive fallback**.
- **Public eligibility is cascading**: a unit is public only if it and every
  ancestor is verified + effective (`v_public_unit`, recursive).
- **Verification ≠ record state**: current verification = latest `verifications`
  row by `created_at` (`verified_at` is informational only). No `record_state`.
- **Assignment overlap** enforced natively by two class-filtered `EXCLUDE`
  constraints (≤1 substantive, ≤1 acting; acting may overlap substantive).

## 3D.1 findings (physical decisions, no design change)

- **FINDING-1** `assignment_class` can't be a generated column (needs a table
  lookup). Kept consistent with its type via a **composite FK**
  `(assignment_type_code, assignment_class) → ref_assignment_types(code, class)`
  — native integrity, no trigger.
- **FINDING-2** Resolver views are **regular** (not materialized) in Slice-1:
  correctness-first, always fresh. Materialization is a later perf decision.
- **FINDING-3** `verifications` has 4 targets here (person/unit/position/
  assignment); `document_id` is deferred until the Document slice exists.
- **FINDING-5** UUIDv4 via core `gen_random_uuid()` (no extension). UUIDv7 is
  revisited in Phase 3D.2 Technical Architecture.

## Data provenance

Only Phase 1 **CONFIRMED** facts are seeded as `verified` (with a
`source_reference`): Wali Kota **dr. H. Khairul, M.Kes.**, Wakil **Ibnu Saud IS**
(dilantik 20-02-2025), Sekda **Abdul Azis Hasan** (dilantik 31-07-2026).
Everything not confirmed (Asisten, Staf Ahli, Kepala Bagian, Subbagian names,
gelar/NIP, nomenklatur) is **omitted** — the schema represents it, but no value
is guessed. Unverified data would enter as `needs_verification` and is held back
from public surfaces automatically by the eligibility gate.
