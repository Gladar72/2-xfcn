#!/usr/bin/env bash
set -euo pipefail
# This script runs inside the isolated database container.
test "$POSTGRES_DB" = ticket_test
sql=(psql -Xq -U postgres -d ticket_test -v ON_ERROR_STOP=1)
cd /tmp/ticket-install
if [[ "$("${sql[@]}" -Atc "select to_regprocedure('public.ticket_test_guest(text)') is not null")" = t ]]; then exit 0; fi
# The archive contains table definitions only. Select ordinary table and constraint DDL;
# skip triggers, policies and any executable definitions from the other database.
pg_restore -l schema.dump | awk '/^[0-9]+; [0-9]+ [0-9]+ (TABLE|SEQUENCE|DEFAULT|CONSTRAINT|FK CONSTRAINT|INDEX) public / || /^[0-9]+; [0-9]+ [0-9]+ SEQUENCE OWNED BY public /' > table.list
grep -q ' TABLE public events ' table.list
pg_restore -L table.list --no-owner --no-privileges -f tables.sql schema.dump
{
  cat bootstrap.sql tables.sql
  printf '%s\n' 'set search_path = public, extensions, pg_catalog;'
  cat migrations/0009_seed_categories.sql migrations/0010_seed_interests.sql migrations/0052_redesign_categories.sql
  cat migrations/0013_accept_application_seat.sql
  sed -n '/^create or replace function /,/^\$\$;/p' migrations/0038_ticket_numbers.sql
  printf '%s\n' 'create trigger event_members_assign_ticket before insert on event_members for each row execute function assign_event_ticket();'
  cat migrations/0091_event_ticket_checkout.sql migrations/0092_ticket_refunds.sql fixtures.sql
  printf '%s\n' 'grant all on all tables in schema public to service_role;' 'grant usage, select on all sequences in schema public to service_role;'
} > install.sql
# Install empty tables, ticket routines and synthetic fixtures in a single transaction.
"${sql[@]}" --single-transaction -f install.sql > /dev/null
