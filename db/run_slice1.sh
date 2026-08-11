#!/usr/bin/env bash
# =====================================================================
# Slice-1 (Pimpinan) runner: apply schema + seed, then run the tests.
#
# Uses standard libpq env vars (PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD).
# Defaults to a database named "setda" on the local socket.
#
#   PGDATABASE=setda ./db/run_slice1.sh
#
# It (re)creates the target database, so point it at a throwaway DB.
# =====================================================================
set -euo pipefail

DB="${PGDATABASE:-setda}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ">> (re)creating database: $DB"
PGDATABASE=postgres psql -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS \"$DB\";" -qc "CREATE DATABASE \"$DB\";"

echo ">> applying schema"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 -q -f "$HERE/migrations/0001_slice1_pimpinan.sql"

echo ">> seeding confirmed baseline"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 -q -f "$HERE/seed/0001_slice1_seed.sql"

echo ">> running tests"
PGDATABASE="$DB" psql -v ON_ERROR_STOP=1 -f "$HERE/tests/0001_slice1_tests.sql" 2>&1 \
    | grep -E "TEST [0-9]+ (PASS|FAILED)|BONUS (PASS|FAILED)"

echo ">> Slice-1 GREEN"
