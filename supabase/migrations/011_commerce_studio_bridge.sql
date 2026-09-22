-- Studio-only durable mailbox. Apply to an isolated project first; this migration is not applied by this PR.
create table if not exists public.commerce_studio_bridge (
  environment_id text not null,
  host_id text not null,
  owner_id text not null,
  revision bigint not null default 1 check (revision > 0),
  document jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (environment_id, host_id)
);

alter table public.commerce_studio_bridge enable row level security;
revoke all on public.commerce_studio_bridge from anon, authenticated;

create or replace function public.commerce_studio_compare_swap(
  p_environment_id text, p_host_id text, p_owner_id text,
  p_expected_revision bigint, p_document jsonb
) returns boolean language plpgsql set search_path = public as $$
begin
  if p_expected_revision = 0 then
    insert into public.commerce_studio_bridge(environment_id, host_id, owner_id, document)
      values (p_environment_id, p_host_id, p_owner_id, p_document)
      on conflict do nothing;
    return found;
  end if;
  update public.commerce_studio_bridge
    set document = p_document, revision = revision + 1, updated_at = now()
    where environment_id = p_environment_id and host_id = p_host_id
      and owner_id = p_owner_id and revision = p_expected_revision;
  return found;
end;
$$;

revoke all on function public.commerce_studio_compare_swap(text, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.commerce_studio_compare_swap(text, text, text, bigint, jsonb) to service_role;
