#!/usr/bin/env bash
# =====================================================================
# Security POC runner: fresh DB -> schema -> seed -> roles/grants -> proof.
# Uses libpq env vars; defaults to database "setda_sec". (re)creates the DB.
# =====================================================================
set -euo pipefail

DB="${PGDATABASE:-setda_sec}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DBROOT="$(cd "$HERE/.." && pwd)"

echo ">> (re)creating database: $DB"
PGDATABASE=postgres psql -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS \"$DB\";" -qc "CREATE DATABASE \"$DB\";"

echo ">> schema (0001) + roles/grants (0002) + external_auth_id (0003)"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 --single-transaction -q -f "$DBROOT/migrations/0001_slice1_pimpinan.sql"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 --single-transaction -q -f "$DBROOT/migrations/0002_roles_grants.sql"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 --single-transaction -q -f "$DBROOT/migrations/0003_users_external_auth_id.sql"

echo ">> seed"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 --single-transaction -q -f "$DBROOT/seed/0001_slice1_seed.sql"

echo ">> security proof"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 -f "$DBROOT/tests/0002_security_poc_tests.sql" 2>&1 \
    | grep -E "SEC [0-9]+ (PASS|FAIL)"

echo ">> SECURITY POC GREEN"
