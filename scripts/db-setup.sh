#!/usr/bin/env bash
# Provisions a throwaway local Postgres and applies the migrations, so the
# SQL parity tests have something real to run against.
set -euo pipefail

PGVER="${PGVER:-16}"
PGBIN="/usr/lib/postgresql/${PGVER}/bin"
PGDATA="${PGDATA:-/var/lib/postgresql/skillunit-test}"
PORT="${PGPORT:-55432}"
SOCKET_DIR="${SOCKET_DIR:-/tmp}"
DB=skillunit

if [ ! -d "$PGDATA/base" ]; then
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
fi

if ! su postgres -c "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PORT -k $SOCKET_DIR' -l $PGDATA/server.log -w start" >/dev/null
fi

CONN="host=$SOCKET_DIR port=$PORT user=postgres"
psql "$CONN dbname=postgres" -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1 \
  || psql "$CONN dbname=postgres" -q -c "create database $DB"

psql "$CONN dbname=$DB" -q -c "drop schema public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
psql "$CONN dbname=$DB" -v ON_ERROR_STOP=1 -q \
  -f supabase/tests/harness.sql \
  -f supabase/migrations/0001_init.sql \
  -f supabase/migrations/0002_functions.sql \
  -f supabase/migrations/0004_log_completion.sql \
  -f supabase/migrations/0005_lock_down_functions.sql

echo "postgresql:///$DB?host=$SOCKET_DIR&port=$PORT&user=postgres"
