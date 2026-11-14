# ADR-3D.2 — Technical Architecture Decision

**Project:** Portal Resmi Sekretariat Daerah Kota Tarakan — `setda.tarakankota.go.id`
**Status:** PROPOSED (for human audit before stack LOCK)
**Supersedes:** none · **Depends on (LOCKED):** Phase 2 IA, Phase 3A/3B/3C content model, Phase 3D.1 GREEN DB slice
**Rule of this phase:** ZERO application code. This document decides the stack; it does not build it.

> Every decision below is scored against the project's real weights. The single largest sensitivity is that this is a **city-government** system whose long-term custodian is **DKISP Tarakan** — so "maintainable & hireable in the Indonesian government context" is weighted as high as raw technical fit.

---

## 1. EXECUTIVE DECISION

| Layer | Decision | Gate |
|---|---|---|
| **Architecture** | Modular monolith, full-stack **SSR** (hard internal public/admin boundary) | LOCKED |
| **Runtime / Language** | **PHP 8.3 + Laravel 11** | **PROPOSED** (1 OPEN input: DKISP skillset) |
| **Public rendering** | Server-side **Blade** templates + aggressive HTTP/CDN cache | LOCKED (given runtime) |
| **Admin/CMS UI** | **Livewire** (server-driven interactivity, minimal JS build) | PROPOSED |
| **Data layer** | **SQL-first**: hand-written SQL migrations (canonical), query builder + read-models over `v_*` views; **Eloquent never owns schema** | LOCKED (principle) |
| **Database** | PostgreSQL 16+ (unchanged; source of truth) | LOCKED |
| **Auth** | Pluggable adapter; **default local** (Fortify), OIDC/SSO swappable | LOCKED (pluggability); provider OPEN |
| **Authorization** | Application-level RBAC reading the 3D.1 `roles/permissions` tables; RLS = deferred defense-in-depth | LOCKED |
| **Storage** | Flysystem abstraction; local (dev) → S3-compatible/MinIO (prod) | LOCKED (abstraction); provider OPEN |
| **Search** | PostgreSQL FTS (Meilisearch deferred) | LOCKED |
| **Testing** | Pest (unit/feature) + existing `db/run_slice1.sh` (DB integration) + Playwright (E2E) | LOCKED |
| **CI/CD** | GitHub Actions: lint → static-analysis → unit/feature (PG service) → migrate → seed → DB tests → build → E2E → GREEN | LOCKED |
| **Deployment** | Docker Compose on a government VM/VPS (on-prem/PDN); **not** Kubernetes | PROPOSED |

**One-line rationale:** for a content-heavy official portal + internal CMS owned by a kota government, a **Laravel modular monolith with a SQL-first data layer** maximizes maintainability/hireability and SSR/SEO while fully respecting the PostgreSQL-owned integrity and eligibility model from Phase 3D.1.

---

## 2. CONTEXT

- Public information portal (SEO-critical, fast, cache-friendly, mobile-first) **and** an internal CMS (RBAC, draft/review/publish, verification, media, audit) in **one** product with different characters.
- The database already owns the hard rules (Phase 3D.1, GREEN): recursive public-eligibility, current-holder resolver, assignment overlap via `EXCLUDE`, composite FK, verification log, `verifications`≠publication. The application must **respect**, not re-implement, these.
- Custodian: **DKISP Tarakan**; hosting likely on-prem / PDN. Team size small; operational simplicity matters more than elegance or peak benchmarks.

---

## 3. CONSTRAINTS (inherited, not re-opened)

| Source | Constraint |
|---|---|
| Phase 2 | Top-nav & IA fixed; public/admin separation; canonical for external news; WCAG 2.1 AA |
| Phase 3A/3B | Person/Position/OrganizationUnit/Assignment core; Verification≠Publication |
| Phase 3C **LOCKED** | Cascading public-eligibility; CURRENT≠PUBLIC holder; no `record_state`; typed-explicit (non-polymorphic) governance relations; owner required at publish |
| Phase 3D.1 **GREEN** | PostgreSQL is schema & rules owner; hand-written SQL migrations; resolver views; `EXCLUDE` overlap; `db/run_slice1.sh` harness must survive into CI |

**No LOCKED decision is altered by this ADR.** One low-severity integration note about the 3D.1 migration files is raised separately under **§ 3D.1 IMPACT** (stops for approval; does not change the ADR).

---

## 4. CANDIDATES (realistically considered)

Full stacks, not just languages:

- **A — Laravel (PHP 8.3)** modular monolith · Blade (public) + Livewire (admin) · SQL-first data layer (query builder + raw SQL, Eloquent as thin read-models over views).
- **B — TypeScript/Node** · Next.js (React) monolith · **Kysely** (SQL-first, type-safe query builder) · SSR/ISR.
- **C — Python/Django** · Django templates + Django admin/Wagtail · Django ORM (+ raw SQL escape hatch).

Rejected without full scoring (with reason): **microservices** (RULE 7 — no operational justification at this size, splits DB ownership); **headless CMS SaaS** (data residency/PDN + gov control); **exotic/edge-only runtimes** (RULE 6 — hiring/longevity risk).

---

## 5. WEIGHTED DECISION MATRIX

Scale 1–5 (integer). Weights sum to 100.

| Criterion | W | A · Laravel | B · Next/TS | C · Django |
|---|--:|--:|--:|--:|
| PostgreSQL-first compatibility | 15 | 4 (60) | 5 (75) | 3 (45) |
| Maintainability by DKISP | 15 | 5 (75) | 3 (45) | 3 (45) |
| SSR / SEO / public performance | 12 | 5 (60) | 5 (60) | 4 (48) |
| CMS capability | 10 | 5 (50) | 3 (30) | 4 (40) |
| Security / boundary | 10 | 4 (40) | 4 (40) | 4 (40) |
| Developer availability / hiring (ID) | 10 | 5 (50) | 4 (40) | 3 (30) |
| Long-term ecosystem maturity | 8 | 5 (40) | 4 (32) | 5 (40) |
| RBAC / auth integration | 6 | 5 (30) | 4 (24) | 4 (24) |
| Structured content / media | 5 | 4 (20) | 4 (20) | 4 (20) |
| Testing / CI | 4 | 4 (16) | 5 (20) | 4 (16) |
| Deployment simplicity | 3 | 5 (15) | 3 (9) | 3 (9) |
| API capability | 2 | 4 (8) | 5 (10) | 4 (8) |
| **TOTAL** | **100** | **464** | **405** | **365** |

**Outcome: A (Laravel) = 464.** B wins the two technical axes it should (PostgreSQL-first, testing/API) but loses the heavily-weighted **maintainability / hiring / deployment** axes that dominate a government custodianship. C is mature but weaker on Indonesian gov-web hiring and on DB-first (ORM is model-first).

**Honest caveat:** A's only sub-max on a top criterion is **PostgreSQL-first (4, not 5)** — precisely where RULE 3 bites (Eloquent is ActiveRecord). This is neutralized by the LOCKED **SQL-first discipline** (§ Fork #2): schema stays in raw SQL, reads go through views/query-builder, Eloquent is used only as read-models. With that discipline A's real-world DB-first fidelity approaches B's, without B's ops/hiring cost.

---

## 6. ADR PER DECISION

### 6.1 Architecture style — **Modular monolith, full-stack SSR** (LOCKED)
- **Alternatives:** full-stack monolith · modular monolith · headless API+SSR · separate FE/BE · microservices.
- **Evidence/trade-offs:** single DB owner (matches Phase 3D.1), one deployable (gov ops capability), strong internal boundary achievable via route groups + middleware + separate read paths. Headless doubles operational surface and duplicates auth for no MVP benefit (RULE 7).
- **Decision:** modular monolith; domain modules (`Organization`, `Content`, `Governance`) with an enforced **public vs admin** seam. Future public JSON API = an added module, not a re-architecture.
- **Consequences:** simplest secure path now; a later native mobile app is served by adding a versioned read API over the same public views.

### 6.2 Runtime/Language — **PHP 8.3 / Laravel 11** (PROPOSED)
- Matrix winner on the government-weighted criteria. Mature LTS, huge Indonesian talent pool, PHP-FPM+nginx ops that DKISP-class teams know.
- **Consequence & mitigation:** loses end-to-end static types that TS+Kysely give → mitigate with **PHPStan/Larastan (max)**, typed DTOs, and read-model classes over views.
- **OPEN input:** if DKISP's actual in-house stack is materially different (e.g., they only run Node or .NET), revisit — see Decision Gates.

### 6.3 Frontend/rendering — **Blade SSR (public) + Livewire (admin)** (PROPOSED)
- Public = server-rendered Blade → best SEO/crawlability, trivially cacheable, no JS build on the critical path. Admin = Livewire → SPA-like forms/workflow **in PHP**, lowest skill barrier for maintainers (vs Inertia+Vue/React).
- **Consequence:** minimal JS toolchain (Vite for assets only); accessibility (WCAG AA) handled in Blade templates + audited in E2E.

### 6.4 ORM/Query — **SQL-first; Eloquent as read-models only** (LOCKED principle) — see Fork #2.

### 6.5 Rendering strategy — public SSR + HTTP/CDN cache + selective static; admin SSR/Livewire, no shared cache. (LOCKED)

### 6.6 Authentication — pluggable adapter, default local (LOCKED pluggability; provider OPEN) — see Fork #3.

### 6.7 Authorization/RBAC — **application-level**, tables from 3D.1 are the authority.
- Enforcement via middleware + Laravel Policies/Gates that read `roles/permissions/role_permissions/user_roles`. Unit-scoped grants use the existing `fn_org_subtree()`.
- **RLS:** evaluated; **deferred** as optional defense-in-depth (single app DB role + gov-team complexity make app-level primary; public reads are already confined to `v_public_*`).
- **Invariant preserved:** `publish` and `verify` are distinct permissions on distinct roles (Publish ≠ Verify).

### 6.8 CMS architecture
- Content entities (News/Agenda/Announcement/Documents/SitePages/Media) run the editorial lifecycle `draft → review → published → archived/unpublished`; institutional facts (Org/Position/Person/Assignment) run `verify` (log) with currentness derived — **exactly as 3C**.
- Two distinct actions in the UI: **Publish** (publisher role) and **Verify** (verifier role); the app never couples them.
- Public visibility is always the **derived AND-gate**; the CMS shows internal/current state, the public site shows only eligible rows.

### 6.9 Public read architecture (LOCKED)
```
Browser → Public (Blade, cacheable) → read-models over v_public_* → PostgreSQL
```
Public code path has **no access** to base tables that could bypass eligibility; a dedicated read DB role may enforce this at the DB level (defense-in-depth, deferred).

### 6.10 Admin read/write architecture (LOCKED)
```
Admin → Auth → RBAC middleware → Application service (transaction) → PostgreSQL
```
Business rules that the DB already guarantees (overlap, eligibility, exactly-one-target) are **not duplicated**; services orchestrate workflow + catch DB constraint violations and surface them as validation errors.

### 6.11 API strategy — **none separate for MVP**; server-rendered + Livewire actions. A read-only public JSON/RSS/iCal feed and a future mobile API are **DEFERRED** modules over public views. (LOCKED for MVP)

### 6.12 Validation — layered, single source each:
| Layer | Owns | Examples |
|---|---|---|
| Database | integrity | FK, CHECK, EXCLUDE, UNIQUE, exactly-one-target |
| Application (FormRequest) | request shape, UX, authorization | required fields, types, permission checks |
| Domain (service) | workflow | state transitions, publish→owner-required, verify log |

### 6.13 Repository structure — see § 8.
### 6.14 Migration tooling/ownership — see § 11.
### 6.15 File/object storage — Flysystem; `public` vs `private` disks; signed URLs for private; malware scan (ClamAV) + EXIF-strip as jobs; provider = local(dev)/S3-MinIO(prod). Provider choice OPEN (PDN/on-prem).
### 6.16 Search — PostgreSQL FTS (already indexed in 3D.1 plan); **Meilisearch DEFERRED** until FTS proves insufficient at scale.
### 6.17 Caching — public: response cache + `Cache-Control`/ETag + reverse-proxy/CDN; **invalidation on publish/verify domain events** (tag-based). Admin: no shared cache. Materialized views deferred (regular views now).
### 6.18 Background jobs — Laravel **Queue (database driver)** for MVP (no Redis dependency), Scheduler (single cron) for sitemap/cache refresh. Jobs: image processing, malware scan, sitemap, cache invalidation, email. Redis/worker scale-out **DEFERRED**.
### 6.19 Observability — Monolog app logs (stdout/file) + error tracking (self-host GlitchTip/Sentry — DEFERRED), `/health` checks, DB slow-query logging. **Business audit = `activity_log` table**, kept strictly separate from technical logs.
### 6.20 Testing — pyramid: **Unit** (Pest) · **Feature/integration** (Pest + PG service) · **DB integration** (`db/run_slice1.sh`, unchanged) · **E2E** (Playwright, already available) public + admin · basic **security** checks.
### 6.21 CI/CD — see § 9.
### 6.22 Deployment/infra — see § 10.

---

## CRITICAL FORK #1 — MONOLITH vs HEADLESS → **Modular Monolith (A)**
```
A (chosen)                         B (headless, rejected for MVP)
Browser                            Public SSR ─┐
  ↓                                            ├→ API → PostgreSQL
Application (one deployable)       Admin CMS ──┘
 ├ Public (Blade, public views)
 ├ Admin/CMS (Livewire, RBAC)      C = modular monolith == A with strict module seams
 ├ Auth adapter
 └ Domain (Org/Content/Gov)
  ↓
PostgreSQL
```
Scored on security, SEO, deployment, complexity, maintainability, performance, API reuse, future mobile, team capability → **monolith wins**: one auth surface, one DB owner, simplest secure boundary, best gov-ops fit. Future API/mobile is additive. Headless rejected as premature (RULE 7), not "un-future-proof."

## CRITICAL FORK #2 — ORM vs SQL-FIRST → **SQL-first (Eloquent as read-models only)** (LOCKED)
Question: does an ORM add enough value to justify abstraction when **PostgreSQL already owns constraints + resolvers**? **No.**
- **Migrations:** the canonical hand-written `db/migrations/*.sql` stay authoritative; the framework only *executes* them.
- **Reads:** Eloquent read-models bound to `v_public_holder`, `v_public_unit`, … (read-only) + query builder for complex/reporting reads; raw SQL where clearer.
- **Writes:** repository/service classes in transactions; DB constraints are the safety net (catch `exclusion_violation`, exactly-one-target, etc.).
- **Never:** Eloquent/Schema-builder as the definition of a table, migration-by-model-diff, or "make the DB reflect the class."

## CRITICAL FORK #3 — AUTH PROVIDER → **pluggable adapter, default local** (LOCKED shape; provider OPEN)
```
                 Application (domain + RBAC)
                        ▲
                 Authorization (our roles/permissions tables)   ← authority, unchanged
                        ▲
                 Identity Port (interface)
              ┌─────────┼─────────────┬───────────────┐
        Local Auth   OIDC/OAuth2   SSO Pemkot        LDAP/AD
        (default)    (Socialite)   (OIDC when avail) (if required)
```
Authentication (who you are) is fully separated from Authorization (what you may do). Swapping providers touches only the adapter, never domain/RBAC. Compared: local (default, always works), OIDC (preferred integration path if Pemkot SSO exposes it), SSO/LDAP (evaluated, adapter-ready). **Provider selection = OPEN (Pemkot input).**

## CRITICAL FORK #4 — GOVERNMENT MAINTAINABILITY (sub-matrix)
| Factor | A · Laravel/PHP | B · Next/TS | C · Django/Python |
|---|---|---|---|
| Developer availability (Indonesia) | Very high — dominant gov/SME web stack | High (JS broad, less gov-web) | Moderate |
| Learning curve (for maintainers) | Low–moderate | Moderate–high (build/toolchain churn) | Moderate |
| Documentation | Excellent, stable | Excellent but fast-moving | Excellent |
| Community | Very large ID community | Large global | Large global |
| Hiring for a Pemkot vendor | Easiest | Feasible | Harder |
| Upgrade path | Predictable LTS | Frequent major churn (framework/React) | Predictable LTS |
| Hosting familiarity (on-prem/PDN) | Very high (PHP-FPM+nginx) | Lower (Node runtime/build) | Moderate (WSGI) |
| Debugging | Straightforward | Good | Good |
| Long-term viability | High | High but volatile | High |

Explanation over score: for a **city government** custodian, the ecosystem the local vendor market and DKISP already operate is the decisive lever. A leads on exactly those factors.

---

## 7. SECURITY BOUNDARY DIAGRAM
```
                         ┌────────────────────────────────────────┐
 ANONYMOUS  ── HTTPS ──▶  │ PUBLIC (Blade SSR, cacheable)          │
                         │  reads ONLY  v_public_*  (eligibility)  │
                         │  no *_by, no audit, no draft/internal   │
                         └───────────────┬────────────────────────┘
                                         ▼
                                   PostgreSQL  (public read role, views only)
                         ┌────────────────────────────────────────┐
 AUTHENTICATED ─ HTTPS ─▶│ Authentication (adapter)               │
                         │      ▼                                  │
                         │ RBAC middleware/policies (3D.1 tables)  │
                         │      ▼                                  │
                         │ Application services (transactions)     │
                         └───────────────┬────────────────────────┘
                                         ▼
                                   PostgreSQL  (app role: base tables + constraints)
```

## 8. REPOSITORY ARCHITECTURE (proposal)
```
/
├── app/
│   ├── Domain/            # Organization / Content / Governance (framework-light)
│   ├── Http/
│   │   ├── Public/        # controllers → read-models over v_public_*
│   │   └── Admin/         # Livewire components + RBAC middleware
│   ├── Auth/              # Identity port + adapters (Local, OIDC, …)
│   ├── ReadModels/        # Eloquent models bound to v_* views (read-only)
│   └── Support/           # Storage, Search, Cache, DTOs
├── resources/views/       # Blade: public/ + admin/
├── routes/                # public.php , admin.php   (the boundary)
├── db/                    # CANONICAL schema (EXISTING, unchanged)
│   ├── migrations/*.sql   #   hand-written DDL (source of truth)
│   ├── seed/*.sql
│   ├── tests/*.sql
│   └── run_slice1.sh
├── database/migrations/   # thin Laravel shims that EXECUTE db/*.sql
├── tests/                 # Pest: Unit/ Feature/ ; e2e/ (Playwright)
├── docs/adr/              # this file + future ADRs
├── .github/workflows/     # CI
└── docker/ , docker-compose.yml (dev/prod compose — design in § 10)
```

## 9. CI/CD ARCHITECTURE
```
PR ─▶ format/lint (Pint)
   ─▶ static analysis (Larastan/PHPStan max)
   ─▶ unit + feature tests (Pest)  ── uses PostgreSQL 16 service container
   ─▶ run db/migrations/*.sql      (schema)
   ─▶ run db/seed/*.sql            (confirmed seed)
   ─▶ db/run_slice1.sh             (DB integration — EXISTING harness, kept)
   ─▶ asset build (Vite)
   ─▶ E2E (Playwright: public + admin smoke)
   ─▶ GREEN ─▶ review ─▶ merge
```
- **Runner:** GitHub Actions (repo already on GitHub). PostgreSQL 16 + `btree_gist` as a service container.
- **Branch protection:** require GREEN + ≥1 review on `main`.
- **Secrets:** GitHub Environments; no secrets in repo.
- **Deploy trigger:** merge→`main` deploys to **staging**; production is a manual/approved promotion (gov change-control).

## 10. DEPLOYMENT ARCHITECTURE (proposal)
```
Internet
   ↓ HTTPS
Reverse proxy / CDN (nginx; optional gov CDN)   ── caches public GET
   ↓
Application (PHP-FPM + nginx)  ── Docker Compose on a gov VM/VPS (on-prem / PDN)
   ├── PostgreSQL 16 (self-managed on-prem/PDN or managed if offered)
   ├── Object storage (MinIO/S3-compatible)  ── public + private buckets
   ├── Queue worker + Scheduler (same host for MVP)
   └── Backups (pg PITR + object-store backup)   Monitoring (health + logs)
```
- **Not Kubernetes** (RULE — no operational justification; DKISP capability). Docker Compose keeps ops within reach; scale-out is a later, evidence-driven step.
- **PostgreSQL:** self-managed on-prem/PDN default; managed PG if the environment offers it. **Provider = OPEN (Pemkot/PDN).**

## 11. MIGRATION BOUNDARY (LOCKED)
- **Schema owner = the hand-written SQL in `db/migrations/`.** Full stop.
- Laravel migration files are **thin wrappers** that `DB::unprepared(file_get_contents(...))` the canonical `.sql`, so `php artisan migrate` works in CI/prod — but they never define schema via Schema-builder or model diffs.
- **The DB schema can never silently change from application/ORM startup.** Reference-table nomenclature corrections are data migrations (INSERT/UPDATE), never `ALTER TYPE` (per 3D.1).

## 12. IMPLEMENTATION SEQUENCE (plan only — no code here)
```
3D.2  LOCK stack (this ADR, after audit)
 └▶ 3D.3  Application Foundation
          (framework skeleton, SQL-migration runner, read-model layer over v_*,
           Identity port + Local adapter, RBAC middleware, CI pipeline live)
 └▶ 3D.4  Pimpinan END-TO-END (DB already GREEN)
          public /pimpinan + /pimpinan/:slug from v_public_holder;
          admin CRUD for org/positions/persons/assignments + verify workflow
 └▶ 3D.5  Harden slice: Pest feature tests + Playwright E2E + CI GREEN
 └▶ 3D.6  Agenda  →  3D.7 News  →  3D.8 Documents  →  3D.9 Media/SitePage
```
Rationale for ordering: Pimpinan's data layer is already proven (3D.1), so it is the cheapest end-to-end vertical to validate the *application* architecture before widening.

---

## DECISION GATES

**LOCKED** (final before coding): architecture style (modular monolith SSR) · DB-first / SQL-first data layer · public/admin security boundary · migration ownership (SQL files) · authorization = app-level RBAC over 3D.1 tables · auth *pluggability* · PostgreSQL FTS for MVP · testing pyramid incl. existing DB harness · CI pipeline shape · public reads via `v_public_*` only.

**PROPOSED** (strong recommendation, one dependency): runtime = **Laravel/PHP** · admin UI = **Livewire** · deployment = **Docker Compose on gov VM**. Dependency: DKISP's actual maintenance capability/preference (OPEN below).

**OPEN** (needs Pemkot/DKISP input): DKISP in-house stack & vendor model (could shift runtime) · auth **provider** (local vs Pemkot SSO/OIDC/LDAP) · hosting target & PostgreSQL provider (on-prem vs PDN vs managed) · object-storage provider · CDN availability · backup ownership.

**DEFERRED** (not needed for MVP): headless/public API + mobile · Meilisearch/OpenSearch · Redis queue/worker scale-out · materialized views · PostgreSQL RLS · external error-tracking · Kubernetes.

**ASSUMPTION** (labeled, revisit if false): Indonesian gov-web talent skews PHP/Laravel; DKISP/vendor can operate PHP-FPM+nginx+PostgreSQL on-prem; MVP traffic is within a single-node monolith's capacity.

---

## 3D.1 IMPACT (raised for approval; does NOT change this ADR)

**Finding:** the canonical `db/migrations/0001_slice1_pimpinan.sql` (and the seed) wrap themselves in explicit `BEGIN; … COMMIT;`. A wrapper runner (Laravel's `migrate`, which itself opens a transaction per migration) would nest transaction control, and some tools error or mis-handle nested `BEGIN/COMMIT`.

**Why it matters:** in 3D.3 we want the *runner* (psql in CI, or the Laravel shim, or a plain migration tool) to own the transaction boundary uniformly, so the same `.sql` files run identically everywhere.

**Does it violate a LOCKED decision?** **No.** It does not touch schema, constraints, resolvers, or any Phase 3C rule. It is purely a tooling-portability concern.

**Recommended revision:** make the migration/seed `.sql` files **transaction-agnostic** — remove the internal `BEGIN;/COMMIT;` and let each runner wrap execution in one transaction (psql via `--single-transaction`, CI already effectively one run, Laravel shim via its own transaction). Tests keep their own `BEGIN … ROLLBACK` (they must, to roll back fixtures). This is a ~2-line change per file, reversible, no behavior change.

**Action:** awaiting your approval before editing 3D.1 files. The ADR stands regardless of this tweak.

---

## STOP
No application code, frontend, backend, API, auth, final Dockerfile, deployment, or DDL change was produced. Awaiting your audit to move any PROPOSED item to LOCKED, and your inputs on the OPEN items, before Phase 3D.3.
