# ADR-3D.2 — AMENDMENT: Vercel + Supabase (free tier) deployment constraint

**Status:** PROPOSED (for audit before Phase 3D.3) · **Amends:** `ADR-3D.2-technical-architecture.md` (affected sections only; the rest stands)
**Trigger:** New hard constraint — *MVP must be deployable on **Vercel + Supabase free tier**; no VPS/PHP server, no Kubernetes, no mandatory paid service for MVP.*

> This amendment **re-opens runtime + auth + architecture-fork + deployment** and supersedes those sections of the base ADR. It does **not** touch any Phase 3C LOCKED rule or the Phase 3D.1 schema. SQL-first / PostgreSQL-as-source-of-truth is explicitly reaffirmed.

---

## 1. NEW DEPLOYMENT CONSTRAINT & ITS CONSEQUENCES

**Constraint:** `MVP must run on Vercel (frontend/functions) + Supabase (managed PostgreSQL, Auth, Storage), free tier.`

| Concern | Consequence of the constraint |
|---|---|
| **Runtime** | Vercel is serverless and first-class for **Node/TypeScript**. A persistent-process runtime (PHP-FPM/Laravel) is **not viable** on Vercel free tier → runtime re-opened and flips to TS (see §2). |
| **Framework** | Next.js is the native Vercel target (SSR/ISR built-in). |
| **SSR** | Provided by Next.js server components / ISR on Vercel edge/Node functions — no server to run. |
| **Backend/API** | No separate backend host; server logic runs as Next.js route handlers / server actions (same deployable). |
| **Database access** | Serverless functions must connect through **Supabase Supavisor pooler (transaction mode)** at runtime; **direct connection** only for migrations. Our schema/views/constraints run unchanged on Supabase Postgres. |
| **Auth** | Supabase Auth becomes the natural default provider (free, OIDC-capable) — behind our Identity Port (see §4). |
| **Storage** | Supabase Storage (free 1 GB) behind a storage port; public/private buckets + signed URLs. |
| **Background jobs** | **No always-on worker** on the free tier → use Vercel Cron + Supabase `pg_cron`; heavy async (malware scan, media pipeline) **deferred**. |
| **Caching** | Next.js ISR + on-demand `revalidateTag` on publish/verify + Vercel edge CDN. No Redis. |
| **Deployment** | Git-push to Vercel (preview per PR, prod on `main`); Supabase migrations applied via CI. Replaces the Docker-Compose/VM plan **for MVP**. |
| **CI** | Same pipeline shape; toolchain becomes TS (eslint/tsc/vitest); **`db/run_slice1.sh` DB harness is kept** and runs against a Postgres 16 service container. |

---

## 2. REVISED RUNTIME DECISION (re-opened)

PHP/Laravel is **no longer a default**. Re-evaluated against the mandated platform.

### 2.1 Platform gate (applied first — a hard constraint, not a preference)
A runtime that cannot run soundly on Vercel free tier fails the gate regardless of other merits:
- **Laravel/PHP → FAILS the gate.** Vercel has no first-class PHP runtime; Laravel's official serverless path is **Vapor → AWS Lambda (paid)**, not Vercel. Community PHP runtimes are not production-sound for a stateful framework (no PHP-FPM, cold starts, no persistent queue/session). → **eliminated by the user-imposed constraint**, not by scoring.
- **Django/Python → weak fit.** Vercel supports Python serverless functions, but Django's whole-app-per-request model is awkward serverless and its ORM is model-first (fights our raw-SQL ownership).
- **Next.js/TypeScript → native fit.**

### 2.2 Revised weighted matrix

Weights re-derived for the new reality and **explained** (sum = 100). Two new criteria (Vercel, Supabase compatibility) are funded mainly by **folding** the base ADR's separate "RBAC/auth" (6) and "structured content/media" (5) into *Security* and *CMS*, plus small trims — **not** by inflating platform weights to force a winner. Maintainability stays a top-3 weight (13).

| Criterion | W | Why this weight | Next.js/TS | Laravel/PHP | Django/Py |
|---|--:|---|--:|--:|--:|
| PostgreSQL-first | 15 | LOCKED invariant; unchanged | 5 (75) | 4 (60) | 3 (45) |
| Maintainability (DKISP) | 13 | Still top-tier, but on a *managed serverless* stack "maintainability" shifts from server-ops (PHP's edge) to app-code — gap narrows | 3 (39) | 5 (65) | 3 (39) |
| SSR / SEO / public perf | 12 | Public portal is SEO-critical | 5 (60) | 5 (60) | 4 (48) |
| Security / boundary | 10 | absorbs former RBAC/auth criterion | 4 (40) | 4 (40) | 4 (40) |
| CMS capability | 10 | absorbs former content/media criterion | 4 (40) | 5 (50) | 4 (40) |
| **Vercel compatibility** | 9 | platform is now a hard constraint | 5 (45) | 2 (18) | 3 (27) |
| Developer availability (ID) | 9 | trimmed 10→9 | 4 (36) | 5 (45) | 3 (27) |
| **Supabase compatibility** | 7 | provider fixed (DB/Auth/Storage) | 5 (35) | 3 (21) | 4 (28) |
| Ecosystem longevity | 7 | trimmed 8→7 | 4 (28) | 5 (35) | 5 (35) |
| Deployment simplicity | 3 | git-push on Vercel | 5 (15) | 1 (3) | 2 (6) |
| Testing / CI | 3 | trimmed 4→3 | 5 (15) | 4 (12) | 4 (12) |
| API capability | 2 | unchanged | 5 (10) | 4 (8) | 4 (8) |
| **TOTAL** | **100** | | **438** | **417** | **355** |

**Note on the matrix:** Laravel still scores respectably on merit (417) because maintainability/CMS/hiring remain high — I did **not** zero those to win the argument. The decisive factor is the **platform gate** (§2.1): Laravel cannot run soundly on the mandated Vercel free tier, which the matrix corroborates via *Vercel compatibility (2)* and *Deployment simplicity (1)*.

### 2.3 Decision
**Runtime = Next.js (App Router) + TypeScript**, deployed on Vercel, data on Supabase Postgres.
**Consequence & mitigation:** we lose Laravel's batteries-included CMS and PHP hiring depth → mitigate with a disciplined SQL-first data layer, a typed read-model layer over views, and Larastan-equivalent strictness (`tsc --strict` + eslint). Long-term DKISP-skillset concern is carried into OPEN (tied to the production-hosting decision).

---

## 3. REVISED ARCHITECTURE FORK

| Option | Verdict |
|---|---|
| **A. Next.js modular monolith / full-stack SSR** (public + admin in one Vercel project) | **CHOSEN** |
| B. Next.js public + separate API/backend | Rejected for MVP: doubles function surface & connection pressure on the free tier; no MVP benefit (RULE 7) |
| C. Laravel + Vercel/Supabase | Eliminated by platform gate (§2.1) |
| D. Astro/SvelteKit public + separate admin | Rejected: two apps exceed the simplicity/quota budget of one free Vercel project; Next.js covers both |

**Architecture style (modular monolith, SSR, hard public/admin boundary) is unchanged from the base ADR — only the runtime under it changed.** One Next.js project: public routes (static/ISR + server components reading `v_public_*`) and admin routes (authenticated server components + route handlers, RBAC middleware), separated as a security seam.

---

## 4. REVISED AUTH DECISION (re-opened)

| Option | Assessment |
|---|---|
| **Supabase Auth** | **Default for MVP** — free, on-platform, supports email/OAuth/**OIDC**. |
| Local auth | Viable behind the same port; more to build/secure ourselves. |
| OIDC / SSO (Pemkot) | Preferred **production** path if Pemkot exposes an IdP; adapter-ready. |
| LDAP/AD | Evaluated; adapter-ready if required. |

**Invariants preserved:**
- **Authentication ≠ Authorization.** Supabase Auth issues a JWT (`sub` = auth user id). Our app maps that id to our own `users` row (a future migration adds a nullable `external_auth_id` for the mapping); **authorization stays our 3D.1 `roles/permissions` tables**. The domain depends on our RBAC, never on Supabase-specific claims beyond the adapter.
- **Publish ≠ Verify** — unchanged (distinct permissions/roles).
- Provider is swappable (Supabase Auth → OIDC/SSO/local) by replacing the Identity adapter only.

**Explicitly rejected:** using Supabase **RLS/PostgREST as the authorization mechanism** — that would move business rules into the DB-API layer and bypass our service/view model. RLS remains DEFERRED defense-in-depth only.

---

## 5. SQL-FIRST — REAFFIRMED (NO CHANGE)

**Supabase is an infrastructure/provider of PostgreSQL — not a replacement for business rules.** Unchanged and LOCKED:
- Schema owned by hand-written SQL migrations; **views, EXCLUDE constraints, composite FK, verification resolver, current-holder resolver, public-eligibility, recursive public-unit** all run on Supabase Postgres **as-is**.
- **Do NOT** adopt the Supabase JS client's table-CRUD/PostgREST model for domain data. Runtime data access = a **SQL-first TS layer** (e.g. Kysely or `postgres.js`) — server-side only — through the **Supavisor transaction pooler**; migrations via the **direct connection**.
- Supabase-provided extensions needed by 3D.1 (`btree_gist`, `pgcrypto`) are standard on Supabase — **verify at provisioning** (ASSUMPTION).

---

## 6. SUPABASE / VERCEL FREE-TIER ASSESSMENT

Figures below are as reported by multiple 2026 secondary summaries and **must be re-confirmed at the official pricing pages before provisioning** (numbers change): [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing). Corroborating summaries: [Vercel Hobby limits 2026](https://costbench.com/software/developer-tools/vercel/free-plan/), [Supabase free tier 2026](https://costbench.com/software/database-as-service/supabase/free-plan/).

| Area | Reported free-tier limit | Implication |
|---|---|---|
| DB size (Supabase) | ~500 MB | OK for structured content MVP; watch growth |
| DB compute | shared CPU, ~500 MB RAM | fine for MVP traffic |
| Connection model | Supavisor pooler required for serverless | design: pooler @ runtime, direct @ migrate |
| File storage | ~1 GB | media-light MVP only; galleries will exceed → prod plan |
| Egress/bandwidth (Supabase) | ~5 GB/mo | fine for MVP; CDN caching helps |
| Auth MAU | ~50,000 | ample |
| Active projects | up to 2 | enough (1 prod-ish + 1 staging) |
| **Backups / PITR** | **none on free** | **unacceptable for official records in production** |
| **SLA** | **none** | **unacceptable for an official portal in production** |
| **Project auto-pause** | **after ~7 days inactivity** | risky for low-traffic/staging phases |
| Vercel bandwidth | ~100 GB/mo | fine for MVP |
| Vercel functions | ~100k invocations, 10s, ~4 CPU-hrs/mo | fine for MVP |
| Vercel builds/deploys | 1 concurrent build; ~100 deploys/day | fine |
| **Vercel Hobby licensing** | **non-commercial only** | **a publicly-launched official gov site likely needs Vercel Pro** |
| Cron (Vercel Hobby) | limited | use `pg_cron` for DB jobs; keep app-cron minimal |

### Works technically  vs  Safe/sustainable for production
- **Works technically for an MVP/pilot/demo:** **YES.** The schema, resolvers, SSR, auth, and storage all run on the free tier.
- **Safe/sustainable for an official government *production* portal:** **NO**, for concrete reasons:
  1. **Vercel Hobby is non-commercial** — an official, publicly-branded portal is organizational use → production needs Vercel **Pro** (or another host).
  2. **No backups / PITR / SLA on Supabase free** — violates Phase 1 backup NFR & risk register for official records.
  3. **Auto-pause after inactivity** — incompatible with an always-available public service (a live portal gets traffic, but staging/pilot phases can pause).
  4. **Data residency / PDN:** a `.go.id` official portal likely carries **Pusat Data Nasional / data-sovereignty** obligations that US/global free tiers cannot meet. **OPEN (regulatory).**
  5. Storage (1 GB) and DB (500 MB) will be outgrown by media/agenda/news accumulation.

**Conclusion:** adopt Vercel + Supabase free tier **for MVP/pilot**, and treat production hosting as an **OPEN** decision with a **documented, cheap migration path** — which is exactly why the abstractions are LOCKED: SQL-first (portable Postgres → PDN/on-prem or paid Supabase), Auth via adapter (→ Pemkot SSO/OIDC), Storage via port (→ on-prem S3/MinIO). The free-tier choice therefore does **not** lock the project into proprietary features.

---

## 7. IMPACT ON PHASE 3D.1

- **Schema/constraints/views/resolvers:** **no change.** They run unmodified on Supabase Postgres (btree_gist/pgcrypto/gen_random_uuid available — verify at provisioning).
- **Approved portability fix applied:** `db/migrations/*.sql` and `db/seed/*.sql` are now **transaction-agnostic** (no internal `BEGIN/COMMIT`); `db/run_slice1.sh` wraps them with `psql --single-transaction`; test file keeps its own `BEGIN … ROLLBACK`. **`run_slice1.sh` re-run: still GREEN (10 tests + RBAC).** No schema/constraint/view/resolver was touched.
- **New (future, non-breaking) note:** production auth mapping will add a nullable `users.external_auth_id` — a later additive migration, not part of Slice-1, no LOCKED impact.

---

## 8. DECISION GATES (revised)

**PRODUCT-OWNER DECISION (2026-08-12, corrected):** the free tier is a **development/pilot** commitment, **not** a production architecture. Three environments:

| Environment | Platform | Status |
|---|---|---|
| **Development** | Vercel Hobby + Supabase Free | 🔒 LOCKED |
| **Staging / Pilot** | Vercel Hobby + Supabase Free | 🔒 LOCKED |
| **Production** | Vercel/Supabase **paid**, **or** Pemkot-managed PostgreSQL, **or** PDN-compliant infra (may move off Vercel if regulation requires) | 🟡 **OPEN** |

**Why the split (not "free forever"):** Vercel Hobby is personal/non-commercial ([Vercel Terms](https://vercel.com/legal/terms)); Supabase Free has **no automatic backups/PITR/SLA** and **auto-pauses after ~1 week of low activity** ([Supabase pricing](https://supabase.com/pricing)). That is acceptable for dev/pilot but **must not** back an official production portal. Crucially, **the Phase 3C / 3D.1 design does not change when production hosting changes** — that portability is exactly the indicator that the design is sound.

**LOCKED (final for dev/pilot before coding):**
- **Dev/Pilot** deploys on **Vercel Hobby + Supabase Free**. **Production hosting/target is OPEN** (table above) and must not be locked to the free tier.
- **Runtime = Next.js (App Router) + TypeScript** (platform-forced for MVP).
- Modular monolith, full-stack SSR, hard public/admin boundary (unchanged).
- **SQL-first / PostgreSQL source of truth** (unchanged); runtime via Supavisor pooler, migrate via direct connection.
- Public reads only through `v_public_*`; app-level RBAC over 3D.1 tables.
- Auth **pluggable**; **default provider = Supabase Auth** (via Identity port).
- Authentication ≠ Authorization; Publish ≠ Verify.
- Migration ownership = hand-written SQL files; Testing = Pest-equiv (vitest) + **`run_slice1.sh`** + Playwright; CI shape unchanged.

**OPEN (needs Pemkot/DKISP/regulatory input):**
- **Production hosting & data residency / PDN** compliance — production is **not** locked to the free tier (see the three-environment table); options: Vercel/Supabase paid, Pemkot-managed PostgreSQL, or PDN-compliant infra.
- **Production backup ownership** — free tier has none; a nightly `pg_dump` via GitHub Actions is a free stop-gap for dev/pilot, but production needs a real backup/PITR plan.
- Production **auth provider** (Pemkot SSO/OIDC vs Supabase Auth vs local).
- Production **object storage** provider.
- Long-term **DKISP maintenance capability** for a TS/Next.js stack.

**DEFERRED (not needed for MVP):** Redis/queue worker, Meilisearch, materialized views, PostgreSQL RLS, malware-scan/heavy media pipeline, mobile/public API, Kubernetes, paid backups/PITR (until production).

**ASSUMPTIONS (labeled; revisit if false):**
- `btree_gist`, `pgcrypto` enabled on Supabase free (verify at provisioning).
- MVP content + media fit within 500 MB DB / 1 GB storage / 5 GB egress.
- Pilot usage is acceptable under Vercel Hobby non-commercial terms (else Pro from day one).
- Serverless + Supavisor transaction-pooler is compatible with the chosen TS SQL layer (`prepare:false`).

---

## STOP
No application code, Next.js/Laravel project, auth implementation, API, UI, or deployment config was produced. Only: the deployment constraint added, runtime/auth/architecture re-decided under it, free-tier assessed with sources, and the approved 3D.1 transaction-portability fix applied (re-verified GREEN). Awaiting your audit before Phase 3D.3.
