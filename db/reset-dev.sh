#!/usr/bin/env bash
# DEV/CI convenience: (re)create $PGDATABASE, run all migrations, seed, and
# make the app roles LOGIN so the application can connect as them locally.
#
# The LOGIN grant is DEV/LOCAL ONLY. In staging/production, app_public and
# app_admin are provisioned as login roles with real passwords out-of-band;
# on Supabase this must be verified against the pooler (see db/security/).
set -euo pipefail
DB="${PGDATABASE:-setda_app}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ">> (re)creating database: $DB"
PGDATABASE=postgres psql -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS \"$DB\";" -qc "CREATE DATABASE \"$DB\";"

PGDATABASE="$DB" bash "$HERE/migrate.sh"

echo ">> seed"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 --single-transaction -q -f "$HERE/seed/0001_slice1_seed.sql"

echo ">> (dev only) enable LOGIN for app roles"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 -qc "ALTER ROLE app_public LOGIN;" -qc "ALTER ROLE app_admin LOGIN;"

echo ">> dev database ready: $DB"
