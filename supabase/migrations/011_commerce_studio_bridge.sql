-- Reference definition for fresh environments. MINZ CASHFLOW COMMERCE already received
-- version 20260922225851_create_commerce_studio_isolated_bridge_schema separately.
-- Do not replay this file against that project or create a public Studio mailbox.
-- Fail closed if that schema already exists; never silently replace a live function.
create schema commerce_studio authorization postgres;
comment on schema commerce_studio is
  'Commerce Studio isolated namespace. Server-only bridge; no browser role access. Shares project Auth and compute.';
revoke all on schema commerce_studio from public, anon, authenticated, service_role;
grant usage on schema commerce_studio to service_role;

create table commerce_studio.commerce_studio_bridge (
  environment_id text not null,
  host_id text not null,
  owner_id text not null,
  revision bigint not null default 1 check (revision > 0),
  document jsonb not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (environment_id, host_id)
);

comment on table commerce_studio.commerce_studio_bridge is
  'Environment/host-bound durable CAS document. No OAuth tokens or API secrets belong in this table. Server authorization is mandatory.';
alter table commerce_studio.commerce_studio_bridge enable row level security;
alter table commerce_studio.commerce_studio_bridge force row level security;
revoke all on commerce_studio.commerce_studio_bridge from public, anon, authenticated, service_role;
grant select, insert, update on commerce_studio.commerce_studio_bridge to service_role;

create function commerce_studio.commerce_studio_compare_swap(
  p_environment_id text, p_host_id text, p_owner_id text,
  p_expected_revision bigint, p_document jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_expected_revision = 0 then
    insert into commerce_studio.commerce_studio_bridge(environment_id, host_id, owner_id, document)
      values (p_environment_id, p_host_id, p_owner_id, p_document)
      on conflict do nothing;
    return found;
  end if;
  update commerce_studio.commerce_studio_bridge
    set document = p_document, revision = revision + 1, updated_at = pg_catalog.now()
    where environment_id = p_environment_id and host_id = p_host_id
      and owner_id = p_owner_id and revision = p_expected_revision;
  return found;
end;
$$;

revoke all on function commerce_studio.commerce_studio_compare_swap(text, text, text, bigint, jsonb) from public, anon, authenticated, service_role;
grant execute on function commerce_studio.commerce_studio_compare_swap(text, text, text, bigint, jsonb) to service_role;

do $verify$
begin
  if pg_catalog.has_schema_privilege('anon','commerce_studio','USAGE')
    or pg_catalog.has_schema_privilege('authenticated','commerce_studio','USAGE')
    or pg_catalog.has_table_privilege('anon','commerce_studio.commerce_studio_bridge','SELECT,INSERT,UPDATE,DELETE')
    or pg_catalog.has_table_privilege('authenticated','commerce_studio.commerce_studio_bridge','SELECT,INSERT,UPDATE,DELETE')
    or pg_catalog.has_function_privilege('anon','commerce_studio.commerce_studio_compare_swap(text,text,text,bigint,jsonb)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','commerce_studio.commerce_studio_compare_swap(text,text,text,bigint,jsonb)','EXECUTE') then
    raise exception 'STUDIO_SCHEMA_UNTRUSTED_PRIVILEGE_ASSERTION_FAILED';
  end if;
end;
$verify$;
