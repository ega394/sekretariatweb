# ADR-3D.3 — Implementation Architecture Specification

**Project:** `setda.tarakankota.go.id` · **Status:** PROPOSED (audit before any code)
**Builds on (do not re-open):** Phase 3C LOCKED · Phase 3D.1 GREEN · Phase 3D.2 (+amendment) LOCKED
**Hard rule of this phase:** ZERO application code. No `.ts/.tsx`, component, route handler, server action, CSS, or final deploy config. This spec is what a developer follows to implement Vertical Slice-1 **without making any new architectural decision.**

**Invariants carried in (non-negotiable):** PostgreSQL = source of truth · public reads only `v_public_*` · `Current Holder ≠ Public Holder` · `Publish ≠ Verify` · `Authentication ≠ Authorization` · SQL-first (no ORM schema ownership) · domain model = 19 tables (unchanged) · free tier = dev/pilot only, production OPEN.

Legend: 🔒 LOCKED · 🟡 PROPOSED · 🟠 OPEN (needs Pemkot/DKISP) · 🔵 DEFERRED · 🔴 CONFLICT.

---

## A. APPLICATION TOPOLOGY

### A1. Repository / folder structure
- **Options:** (a) single Next.js App Router project; (b) monorepo (public + admin packages); (c) two apps.
- **Criteria:** free-tier project quota, one deployable, security seam, simplicity for DKISP.
- **Chosen:** **single Next.js App Router project**, modular internally (route groups `(public)` / `(admin)`; domain/data/auth as plain TS modules).
- **Why:** one Vercel project fits the free tier; internal seams give the boundary without operational split (RULE 7).
- **Consequences:** boundary is enforced by convention **and** by a DB-privilege split (A2/C15), not by separate deploys. **Status: 🔒**

### A2. `public` vs `admin` boundary
- **Chosen:** two route groups with **two distinct data-access clients bound to two least-privilege PostgreSQL roles**:
  - `publicDb` → role **`app_public`**: `SELECT` on `v_public_*` views **only** (no base tables, no `v_current_*`).
  - `adminDb` → role **`app_admin`**: DML on base tables, behind Auth+RBAC.
- **Why:** the boundary is enforced at the database grant layer, so a bug in public code **cannot** read internal/unverified data.
- **Consequences:** requires a security migration creating the roles + grants (see B9/C15). **Status: 🔒 (app-layer) / 🟡 (DB-role enforcement on Supabase pooler — verify)**

### A3. Server vs Client Component boundary
- **Chosen:** **Server Components by default**; Client Components only for interactivity (form widgets). All data access + secrets stay server-side; the DB client/services are **never** imported into a Client Component.
- **Why:** keeps business rules and credentials off the browser; supports SSR/SEO.
- **Consequences:** mutations use Server Actions (D17); client gets rendered HTML / typed props only. **Status: 🔒**

### A4. Route / layout / middleware
- **Chosen:** `middleware.ts` establishes the **authenticated session** for `(admin)` (redirects anonymous → login); **authorization (RBAC) is enforced in services/actions**, not middleware alone (defense in depth). `(public)` has no auth and is cacheable.
- **Why:** middleware is coarse (session presence); fine-grained permission checks belong next to the data mutation.
- **Consequences:** every admin mutation independently authorizes. **Status: 🔒**

---

## B. DATA & DOMAIN

### B5. Query layer — **Kysely (query builder) over a `postgres.js` driver**  — ADR
- **Options considered:** `postgres.js` alone · **Kysely** (over `pg` or `postgres.js`) · Drizzle · Prisma.
- **Criteria:** SQL-first, no schema ownership, first-class views, recursive CTE, PG constraints, transactions, typed results, Supabase pooler compat.
- **Rejected:** Prisma/Drizzle — model-first / schema-owning tendencies conflict with RULE 3 (DB owns schema, views, EXCLUDE, composite FK).

| Aspect | `postgres.js` alone | **Kysely** (chosen, over `postgres.js`) |
|---|---|---|
| PostgreSQL **views** | plain `SELECT`; view is a relation | first-class: view declared in the `Database` type → **type-safe reads** (`db.selectFrom('v_public_holder')`) |
| **Raw SQL** | native (its core strength) | `sql`\`\` escape hatch; drop to raw anytime |
| **CTE / recursive** | write raw SQL | `.with()/.withRecursive()` builder **or** raw `sql` |
| **PG-specific constraints** | surfaces DB errors only | same — constraints stay in DB; typed catch of `exclusion_violation` etc. |
| **Transaction** | `sql.begin(async sql => …)` | `db.transaction().execute(async trx => …)` |
| **Typed result** | manual row typing | **types generated from the live schema** (kysely-codegen reading `information_schema` + views) → DB drives the types |
| **Migration ownership** | not a migration tool → schema stays external ✅ | has a migration API we **do not use**; schema stays in `db/migrations/*.sql` ✅ |
| **Supabase pooler** | `postgres(url,{prepare:false})` for transaction mode | via the postgres.js dialect with `prepare:false` |

- **Chosen:** **Kysely** as the query layer, **`postgres.js`** as the driver (pooler-friendly).
- **Why:** Kysely's generated types make **the view the typed source of truth** — a developer literally receives the already-public-gated shape from `v_public_holder`, which structurally discourages re-deriving eligibility in TS (the exact anti-pattern we must prevent). `postgres.js` gives clean pooler support and a raw-SQL hatch for recursive/complex reads.
- **Consequences:** types are **generated from the DB** (never hand-authored as a schema definition); no migration authority in the app. **Status: 🔒**

### B6. Database access layer & query rules
- **Chosen rules:** (1) public code imports **only** `publicDb`; (2) all writes go through the **service layer** in a transaction; (3) parameterized queries only; (4) institutional "current/public" state is **read from views, never recomputed**; (5) errors from DB constraints are caught and mapped to domain/validation errors. **Status: 🔒**

### B7. Read models over views
- **Chosen:** thin read-model functions returning view-typed rows, e.g. `getPublicHolder(positionSlug)` → `v_public_holder ⋈ positions ⋈ persons` (public); `listPublicPimpinan()`. Admin read-models may read `v_current_holder`/`v_current_verification` (fact) under RBAC. **Status: 🔒**

### B8. Write / service layer & transaction boundary
- **Chosen:** services (`AssignmentService`, `VerificationService`, `PublishService`, …) each own a single `adminDb.transaction()`; they **orchestrate** workflow and **catch** DB constraint violations (overlap, exactly-one-target, check) → typed domain errors. **No business rule is duplicated** — overlap/eligibility remain the DB's job. **Status: 🔒**

### B9. Migration / seed execution model (post-3D.1 finding)
- **Chosen:** canonical schema = `db/migrations/*.sql` (transaction-agnostic). A small **migration runner** (Node script or `psql`) applies them over the **direct connection** (session mode; DDL/advisory locks need it) — **not** the pooler. Seed likewise. CI uses `db/run_slice1.sh`. Production migration = an explicit, approved deploy step against the target DB's direct connection. Kysely's migration API is **not** used for schema. A **security migration** (new, additive) creates `app_public`/`app_admin` roles + grants (A2/C15). **Status: 🔒 (model) / 🟡 (roles migration to be written in 3D.4)**

### B10. How the five resolver views are consumed
| View | Surface | Client | Rule |
|---|---|---|---|
| `v_public_holder` | public `/pimpinan`, `/pimpinan/[slug]` | `publicDb` | the only source of "who to show publicly" |
| `v_public_eligibility` | public listing/guards | `publicDb` | never recomputed in app |
| `v_public_unit` | public struktur (later slice) | `publicDb` | cascading result consumed as-is |
| `v_current_holder` | **admin** "current (fact)" panel | `adminDb` + RBAC | **never** exposed to public |
| `v_current_verification` | **admin** verification status | `adminDb` + RBAC | fact, admin-only |

**Status: 🔒**

---

## C. AUTHENTICATION & AUTHORIZATION

### C11. Supabase Auth adapter / Identity port
- **Chosen:** an `IdentityProvider` port `{ getIdentity(request) → { externalId, email } | null }`. Default implementation validates the **Supabase session/JWT** (server-side `@supabase/ssr`). Swappable for OIDC/SSO/local.
- **Why:** domain depends on the port, not Supabase specifics (Auth ≠ Authorization; provider pluggable). **Status: 🔒 (port) / 🔒-MVP (default = Supabase Auth)**

### C12. Mapping Auth identity → `users`
- **Chosen:** map `externalId` → our `users` row via a **new nullable column `users.external_auth_id`** (an **additive** migration on the existing infra table — **not** a new domain table). Unmapped identity → no access until an admin provisions the user + roles. First `super_admin` already seeded.
- **Consequences:** requires additive migration `users.external_auth_id` (+ unique index) authored in 3D.4. **Status: 🟡 (migration pending, additive; no domain table added)**

### C13. RBAC authorization service
- **Chosen:** `AuthorizationService.can(userId, permission, { unitScope? })` reading `roles/permissions/role_permissions/user_roles` (3D.1). Enforced inside services + as a guard at each server action. Permissions from 3D.1 (`manage_org_structure`, `write_verification`; `publisher` gains publish perms when editorial content lands). **Status: 🔒**

### C14. Unit / subtree scoping
- **Chosen:** unit-scoped grants resolved via `fn_org_subtree(user.primary_unit_id)` (already in 3D.1). For **Slice-1 Pimpinan**, structural edits are `super_admin` only, so subtree scoping exists but is **not exercised** until unit-owned editorial content arrives. **Status: 🔒 (mechanism) / 🔵 (Slice-1 usage deferred)**

### C15. Boundary: public request can never obtain internal data
- **Chosen:** `publicDb` connects as **`app_public`**, a role granted `SELECT` on `v_public_*` views **only**. PostgreSQL executes those views with the (privileged) view **owner's** rights, so `app_public` reads eligible rows **without** any base-table or `v_current_*` privilege. A public-code mistake therefore **cannot** reach internal/unverified data — the boundary is DB-enforced, not merely app-enforced.
- **Consequences:** roles/grants security migration required; **verify Supabase pooler supports connecting as a second least-privilege role** (fallback: app-layer enforcement + `security_invoker` views / RLS, DEFERRED). **Status: 🔒 (design) / 🟡 (Supabase-pooler role support — verify) / app-layer boundary 🔒**

---

## D. WEB APPLICATION

### D16. Public SSR / SEO / caching / **revalidation (currentness-safe)**
- **Chosen:** public pages = Server Components with cache **tags**; `/pimpinan` tagged `pimpinan`, `/pimpinan/[slug]` tagged `pimpinan:{slug}`. **Any admin mutation that can change eligibility** — record/expire a verification, create/end an assignment, (later) publish — calls `revalidateTag('pimpinan')` and `revalidateTag('pimpinan:{slug}')` inside the same service transaction's success path.
- **Why:** a mutasi (new Sekda verified, previous ended) **immediately invalidates** the public cache → `/pimpinan` and `/pimpinan/[slug]` re-render from `v_public_holder` → **no stale pejabat**. Caching never trumps officeholder currentness.
- **Consequences:** services must emit revalidation tags on eligibility-affecting writes; SEO via metadata + sitemap from public views; external news uses canonical (later slice). **Status: 🔒**

### D17. Admin CMS architecture & form/action pattern
- **Chosen:** admin = Server Components + **React Server Actions** for mutations: `form → server action → AuthorizationService.can(...) → Service.transaction() → adminDb`. Application-level input validation with **zod** at the action boundary (DB stays the integrity authority). Progressive-enhancement forms, minimal client JS. **Status: 🔒 (pattern) / 🟡 (zod as validator)**

### D18. Media upload / storage abstraction
- **Chosen:** `StoragePort { putPublic, putPrivate, signedUrl }`; MVP impl = **Supabase Storage** (public/private buckets, signed URLs). EXIF-strip inline (sharp) for public images; malware scan deferred. Media is **out of Slice-1 scope** (the `media_*` tables are not in Slice-1), so this is specified now, implemented later. **Status: 🔒 (abstraction) / 🔵 (Slice-1 implementation deferred)**

### D19. Error handling, logging, observability, security baseline
- **Error handling:** domain errors (expected, → user message) vs unexpected (→ 500 + logged); DB constraint violations mapped to field/validation errors.
- **Logging:** structured (pino) to stdout (Vercel captures). No secrets/PII beyond necessity.
- **Observability:** `/health` (DB connectivity); external error-tracking 🔵 deferred. **Business audit = `activity_log`** table (separate from technical logs), written by services (audit-metadata columns now; full trail 🔵 deferred).
- **Security baseline:** HTTPS (Vercel), HttpOnly/secure session cookies, CSRF (same-origin server actions), security headers/CSP, input validation, **least-privilege DB roles** (`app_public`/`app_admin`), secrets in env (never repo). **Status: 🔒 (baseline) / 🔵 (some items deferred)**

---

## E. DELIVERY

### E20. CI/CD, testing pyramid, env/secrets, deploy, promotion
- **CI (GitHub Actions), ordered:**
  `lint (eslint) → typecheck (tsc --noEmit) → unit+integration (vitest) → [PostgreSQL 16 service + btree_gist] → db/run_slice1.sh (migrate+seed+DB tests) → build (next build) → E2E (Playwright: public /pimpinan + admin smoke) → GREEN`
- **Testing pyramid:** unit (services, RBAC, mappers) · integration (data-access vs real PG) · **DB integration (`db/run_slice1.sh`, existing, unchanged)** · E2E (Playwright).
- **Env/secrets:** per environment — `DATABASE_URL_DIRECT` (migrations), `DATABASE_URL_POOL` (Supavisor runtime), `APP_PUBLIC_DB_URL`/`APP_ADMIN_DB_URL` (role-scoped), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only). In Vercel env + GitHub secrets; never in repo.
- **Deploy/promotion:** PR → Vercel Preview; **staging/pilot** = Vercel Hobby + Supabase Free; **production** target 🟠 OPEN. Promotion: `dev → staging/pilot → production`.
- **Status: 🔒 (pipeline, testing, promotion shape) / 🟠 (production env values)**

---

## OUTPUT 2 — DECISION MATRIX (summary)

| # | Area | Chosen | Status |
|---|---|---|---|
| A1 | Repo structure | single Next.js App Router project | 🔒 |
| A2 | public/admin boundary | route groups + 2 DB roles | 🔒 / 🟡 (pooler role) |
| A3 | Server/Client boundary | Server-default; no DB in client | 🔒 |
| A4 | Route/middleware | session in middleware; RBAC in services | 🔒 |
| B5 | Query layer | Kysely over postgres.js | 🔒 |
| B6 | Access rules | public=views only; writes via services | 🔒 |
| B7 | Read models | view-typed read functions | 🔒 |
| B8 | Service/tx | one tx per service; catch DB errors | 🔒 |
| B9 | Migration model | raw SQL via direct conn; run_slice1.sh in CI | 🔒 / 🟡 roles migration |
| B10 | View consumption | public=v_public_*; admin=v_current_* | 🔒 |
| C11 | Identity port | Supabase Auth adapter | 🔒 |
| C12 | Identity→users | users.external_auth_id (additive) | 🟡 |
| C13 | RBAC service | can(user,perm,scope) over 3D.1 tables | 🔒 |
| C14 | Subtree scope | fn_org_subtree | 🔒 / 🔵 slice-1 |
| C15 | Public data boundary | app_public role, views only | 🔒 / 🟡 pooler |
| D16 | Public cache | tag revalidation on eligibility change | 🔒 |
| D17 | Admin actions | server actions + zod + RBAC | 🔒 / 🟡 zod |
| D18 | Media/storage | StoragePort → Supabase Storage | 🔒 / 🔵 slice-1 |
| D19 | Errors/log/sec | pino, health, least-priv roles, CSP | 🔒 / 🔵 some |
| E20 | CI/CD & deploy | GH Actions + run_slice1.sh; promotion | 🔒 / 🟠 prod env |

---

## OUTPUT 3 — DEPENDENCY GRAPH
```
Phase 3C (business truth)
   └─ Phase 3D.1 (PostgreSQL: tables, EXCLUDE, composite FK, v_* resolvers)  [GREEN]
        └─ Phase 3D.2 (Next.js/TS · SQL-first · Supabase · RBAC)  [LOCKED]
             └─ Phase 3D.3 (THIS: topology, query layer, authz, web, CI)
                  ├─ needs: users.external_auth_id migration (additive)      🟡
                  ├─ needs: app_public/app_admin roles+grants migration      🟡
                  └─ enables → Vertical Slice-1 implementation (3D.4)
```

## OUTPUT 4 — REPOSITORY TREE (text only; not created)
```
/
├── app/
│   ├── (public)/
│   │   ├── layout.tsx                # public shell (cacheable)
│   │   └── pimpinan/
│   │       ├── page.tsx              # list  → getPublicPimpinan()
│   │       └── [slug]/page.tsx       # office→ getPublicHolder(slug)
│   ├── (admin)/
│   │   ├── layout.tsx                # requires session (middleware)
│   │   └── pimpinan/ …               # CRUD + verify (server actions)
│   └── api/health/route.ts           # health check
├── middleware.ts                     # admin session gate
├── src/
│   ├── db/
│   │   ├── public-client.ts          # publicDb  (role app_public, pooler)
│   │   ├── admin-client.ts           # adminDb   (role app_admin, pooler)
│   │   ├── types.generated.ts        # kysely-codegen from live schema
│   │   └── read-models/              # getPublicHolder, listPublicPimpinan…
│   ├── domain/                       # Organization / Governance services
│   ├── auth/                         # IdentityProvider port + Supabase adapter
│   ├── rbac/                         # AuthorizationService
│   └── support/                      # StoragePort, logging, errors
├── db/                               # EXISTING canonical schema (unchanged)
│   ├── migrations/*.sql  seed/*.sql  tests/*.sql  run_slice1.sh
│   └── (3D.4) 0002_roles_grants.sql · 0003_users_external_auth_id.sql   🟡
├── tests/  (unit/ integration/ e2e-playwright/)
├── docs/adr/                         # 3C…3D.3 records
└── .github/workflows/ci.yml
```

## OUTPUT 5 — REQUEST / DATA-FLOW DIAGRAMS
```
PUBLIC (anonymous, read-only, cacheable)
Browser ─▶ Next.js (public Server Component)
        ─▶ publicDb (role app_public, Supavisor pooler)
        ─▶ v_public_holder / v_public_eligibility        ← ONLY these
        ─▶ PostgreSQL (3C rules + 3D.1 constraints/resolvers)

ADMIN (authenticated, RBAC, read/write)
Browser ─▶ Next.js (admin) ─▶ middleware (session)
        ─▶ Server Action ─▶ AuthorizationService.can(...)
        ─▶ Service.transaction() ─▶ adminDb (role app_admin, pooler)
        ─▶ base tables (+ v_current_* for fact view)
        ─▶ PostgreSQL (constraints enforce overlap/eligibility)
        ─▶ on success: revalidateTag('pimpinan', 'pimpinan:{slug}')

FORBIDDEN (the anti-pattern this spec exists to prevent)
Browser ─▶ query assignments ─▶ pick person by created_at in TS
        ─▶ check verification in TS ─▶ decide "public" in app code   ✗ NEVER
```

## OUTPUT 6 — SECURITY BOUNDARIES
```
┌─ PUBLIC ZONE ───────────────────────────────┐
│ no auth · role app_public · v_public_* only  │  DB grant makes internal data unreachable
└──────────────────────────────────────────────┘
┌─ ADMIN ZONE ────────────────────────────────┐
│ Auth (Supabase) → RBAC (our tables) →        │
│ services → role app_admin → base tables      │
└──────────────────────────────────────────────┘
Why the browser never gets privileged DB access: the DB credential lives only
in server-side env; the browser receives rendered HTML/typed props, never a
connection string or query capability. Public server code holds only the
view-scoped app_public credential; privileged writes require an authenticated,
RBAC-checked server action.
```

## OUTPUT 7 — CI PIPELINE SPECIFICATION
```
on: pull_request, push(main)
jobs:
  verify:
    services: postgres:16  (+ CREATE EXTENSION btree_gist, pgcrypto)
    steps:
      1 lint         : eslint .
      2 typecheck    : tsc --noEmit
      3 unit+integr  : vitest run           (needs PG for integration)
      4 db-harness   : bash db/run_slice1.sh # migrate+seed+10 tests+RBAC  ← existing GREEN
      5 build        : next build
      6 e2e          : playwright test       (public /pimpinan + admin smoke)
    gate: all steps green  → allow review/merge (branch protection on main)
```

## OUTPUT 8 — ENVIRONMENT MATRIX
| | Development | Staging / Pilot | Production |
|---|---|---|---|
| Frontend/functions | Vercel Hobby | Vercel Hobby | 🟠 OPEN (Pro / other) |
| Database | Supabase Free | Supabase Free | 🟠 OPEN (paid / Pemkot PG / PDN) |
| Auth | Supabase Auth | Supabase Auth | 🟠 OPEN (Supabase / SSO Pemkot) |
| Storage | Supabase Storage | Supabase Storage | 🟠 OPEN |
| Backups | none (pg_dump stop-gap 🔵) | none | 🟠 OPEN (real PITR) |
| Status | 🔒 | 🔒 | 🟠 |

## OUTPUT 9 — MIGRATION / DEPLOYMENT FLOW
```
Schema change: edit db/migrations/*.sql (canonical)
  → CI: run_slice1.sh on fresh PG (must stay GREEN)
  → apply to Supabase (dev) via DIRECT connection (session mode)
  → runtime app connects via POOLER (transaction mode, prepare:false)
Deploy: PR → Vercel Preview → merge main → staging → (approved) production 🟠
Migrations are an explicit, ordered, approved step — never auto-run from app start.
```

## OUTPUT 10 — OPEN / PROPOSED / DEFERRED / CONFLICT
- **🟡 PROPOSED (resolve at start of 3D.4, non-blocking):** `users.external_auth_id` additive migration · `app_public`/`app_admin` roles+grants migration (+verify Supabase pooler supports a second role; fallback app-layer + RLS) · zod as validator.
- **🟠 OPEN (Pemkot/DKISP; do NOT lock):** production hosting · SSO Pemkot · data residency/PDN · production object storage · production backup ownership · long-term DKISP capability.
- **🔵 DEFERRED (not for Slice-1):** media pipeline/malware scan · full audit-trail table · external error-tracking · Redis/queue · Meilisearch · materialized views · RLS · mobile/public API.
- **🔴 CONFLICT:** **none found.** Every Slice-1 requirement is satisfiable without altering a LOCKED decision. (The two 🟡 items are additive infra, not conflicts.)

## OUTPUT 11 — TRACEABILITY MATRIX (audit before any code)
| Invariant | 3C | 3D.1 | 3D.2 | 3D.3 enforcement |
|---|---|---|---|---|
| Current Holder ≠ Public Holder | defined | `v_current_holder` / `v_public_holder` | — | public reads `v_public_holder` only; `v_current_holder` is admin+RBAC (B10, C15) |
| Verification = latest by `created_at` | rule | `v_current_verification` | — | consumed via view; **never** re-derived in TS (B6, D-forbidden) |
| Public eligibility cascading | rule | `v_public_unit`/`_eligibility` | — | `publicDb` reads `v_public_eligibility`; app never recomputes (B7) |
| Person ≠ tenure | rule | persons no temporal | — | read-models keep identity vs assignment separate (B7) |
| Assignment overlap | rule | 2× `EXCLUDE` | — | service catches `exclusion_violation`; not re-checked in app (B8) |
| Publish ≠ Verify | rule | roles/permissions | RBAC | distinct permissions + distinct services/actions (C13, D17) |
| Authentication ≠ Authorization | — | users vs RBAC | Supabase Auth + RBAC | IdentityPort (authn) vs AuthorizationService (authz) (C11–C13) |
| PostgreSQL = source of truth | — | schema/resolvers | SQL-first | Kysely reads views; no ORM schema ownership (B5, B9) |
| Public reads only `v_public_*` | — | views | boundary | `app_public` role + `publicDb` (A2, C15) |
| No business rule in frontend | — | — | — | Server Components/Actions only; nothing rule-bearing in client (A3, D17) |
| Domain = 19 tables | 3C | 3D.1 | — | no new domain table; only additive infra column/roles (B9, C12) |

## OUTPUT 12 — GO / NO-GO
**Verdict: 🟢 GO to implement Vertical Slice-1 (Pimpinan) on the dev environment**, provided the two 🟡 additive infra items are authored at the **start** of 3D.4 (they are small, additive, and block nothing conceptually):
1. `db/migrations/0002_roles_grants.sql` — `app_public`/`app_admin` roles + view/table grants (verify pooler role support; fallback documented).
2. `db/migrations/0003_users_external_auth_id.sql` — additive column + unique index for Auth mapping.

**None of the 🟠 OPEN items block Slice-1 dev/pilot** — they concern production only. **Acceptance criterion met:** a developer can implement Slice-1 by following A–E without inventing any architecture; every remaining choice is an explicitly labelled 🟡/🟠/🔵, not a guess.

---

## STOP
No application code, project scaffold, auth implementation, API, UI, or deploy config was produced. Awaiting your audit. On approval, Phase 3D.4 begins with the two additive migrations, then the Slice-1 public read path (`/pimpinan`) end-to-end.
