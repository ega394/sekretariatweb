#!/usr/bin/env bash
# Apply ALL migrations in db/migrations in sorted order against $PGDATABASE.
# Each file is transaction-agnostic; psql --single-transaction wraps it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for f in "$HERE"/migrations/*.sql; do
    echo ">> migrate: $(basename "$f")"
    psql -v ON_ERROR_STOP=1 --single-transaction -q -f "$f"
done
