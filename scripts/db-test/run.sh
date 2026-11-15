#!/usr/bin/env bash
# Run the pgTAP tests in supabase/tests against a throwaway local Postgres.
# Use this when `supabase db reset && supabase test db` cannot run (no Docker images).
# Needs Postgres 16+ server binaries and pgTAP installed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUNAS=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DATA"; RUNAS=(runuser -u postgres --); fi
"${RUNAS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" -w start >/dev/null
trap '"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null; rm -rf "$DATA"' EXIT
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/scripts/db-test/supabase-shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f" >/dev/null; done
"${PSQL[@]}" -c 'create extension if not exists pgtap with schema extensions' >/dev/null
fail=0
for t in "$ROOT"/supabase/tests/*.test.sql; do
  echo "# $(basename "$t")"
  out="$("${PSQL[@]}" -X -t -A -c 'set search_path = public, extensions' -f "$t" 2>&1)" || fail=1
  echo "$out"
  grep -q '^not ok' <<<"$out" && fail=1
done
exit $fail
