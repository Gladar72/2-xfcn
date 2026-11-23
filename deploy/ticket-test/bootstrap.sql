create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role ticket_rest login noinherit;
grant anon, authenticated, service_role to ticket_rest;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
