begin;
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table private.diwan_secret (
  owner_id uuid primary key references public.profiles(id),
  passcode_hash text not null,
  attempted_at timestamptz[] not null default '{}'
);
create table private.diwan_unlocks (
  session_id uuid primary key,
  owner_id uuid not null references public.profiles(id),
  expires_at timestamptz not null
);
alter table private.diwan_secret enable row level security;
alter table private.diwan_unlocks enable row level security;
revoke all on private.diwan_secret, private.diwan_unlocks from public, anon, authenticated;

create function private.diwan_owner() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  join private.account_logins a on a.user_id = p.id
  where a.username = 'ziyad' and p.id = auth.uid() and p.role = 'judge' and p.is_active
    and coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
    and exists (select 1 from auth.sessions s where s.user_id = p.id
      and s.id::text = auth.jwt()->>'session_id' and (s.not_after is null or s.not_after > now()))
$$;
create function private.diwan_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.diwan_unlocks u
    where u.owner_id = private.diwan_owner()
      and u.session_id::text = auth.jwt()->>'session_id' and u.expires_at > now())
$$;

-- Fixed digest length prevents bcrypt's password-length truncation.
create function private.diwan_gate(action text, code text, new_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.diwan_owner();
  current_session_id uuid;
  secret private.diwan_secret;
  recent timestamptz[];
  material text;
  crypto_schema text;
  valid boolean;
begin
  if actor is null then return 'forbidden'; end if;
  current_session_id := (auth.jwt()->>'session_id')::uuid;
  if action = 'status' then
    if private.diwan_allowed() then return 'unlocked'; end if;
    if exists (select 1 from private.diwan_secret where owner_id = actor) then return 'locked'; end if;
    return 'setup';
  end if;
  if action = 'lock' then
    delete from private.diwan_unlocks u where u.session_id = current_session_id and u.owner_id = actor;
    return 'locked';
  end if;
  if action not in ('setup','unlock','change') or code is null or char_length(code) not between 8 and 128 then return 'invalid'; end if;
  if action = 'change' and (not private.diwan_allowed() or new_code is null or char_length(new_code) not between 8 and 128) then
    return 'invalid';
  end if;
  -- pgcrypto may already reside in a different schema in the organizer.
  select n.nspname into strict crypto_schema from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  execute format('select pg_catalog.encode(%I.digest($1, ''sha256''), ''hex'')', crypto_schema)
    into material using code;
  if action = 'setup' then
    execute format('insert into private.diwan_secret(owner_id, passcode_hash)
      values ($1, %1$I.crypt($2, %1$I.gen_salt(''bf'', 12))) on conflict (owner_id) do nothing returning owner_id', crypto_schema)
      into secret.owner_id using actor, material;
    if secret.owner_id is null then return 'locked'; end if;
  else
    select * into secret from private.diwan_secret where owner_id = actor for update;
    if not found then return 'setup'; end if;
    recent := array(select attempt from unnest(secret.attempted_at) attempt where attempt > now() - interval '15 minutes');
    if cardinality(recent) >= 5 then return 'limited'; end if;
    execute format('select %I.crypt($1,$2) = $2', crypto_schema) into valid using material,secret.passcode_hash;
    update private.diwan_secret set attempted_at = case when valid then '{}'::timestamptz[] else array_append(recent,now()) end
      where owner_id = actor;
    if not valid then return 'invalid'; end if;
    if action = 'change' then
      execute format('select %1$I.crypt(pg_catalog.encode(%1$I.digest($1, ''sha256''), ''hex''), %1$I.gen_salt(''bf'', 12))', crypto_schema)
        into material using new_code;
      update private.diwan_secret set passcode_hash=material where owner_id=actor;
      delete from private.diwan_unlocks where owner_id=actor;
    end if;
  end if;
  delete from private.diwan_unlocks u where u.owner_id=actor and u.expires_at<=now();
  insert into private.diwan_unlocks values (current_session_id, actor, now() + interval '30 minutes')
    on conflict on constraint diwan_unlocks_pkey do update set expires_at = excluded.expires_at;
  return 'unlocked';
end
$$;

create function public.diwan_gate(action text, code text default null, new_code text default null) returns text
language sql security invoker set search_path = '' as $$
  select private.diwan_gate(action, code, new_code)
$$;
revoke all on function private.diwan_owner(), private.diwan_allowed(), private.diwan_gate(text,text,text),
  public.diwan_gate(text,text,text) from public, anon, authenticated;
grant execute on function private.diwan_allowed(), private.diwan_gate(text,text,text),
  public.diwan_gate(text,text,text) to authenticated;

create table public.diwan_cases (
  case_number text primary key check (length(case_number) between 1 and 80),
  document jsonb not null check (jsonb_typeof(document) = 'object' and document ? 'caseNumber'
    and document->>'caseNumber' = case_number)
);
create table public.diwan_settings (
  name text primary key check (name in ('customCategories', 'classificationAliases')),
  value jsonb not null check (jsonb_typeof(value) = 'array')
);
create table public.diwan_classification_audit (
  id text primary key default gen_random_uuid()::text,
  document jsonb not null check (jsonb_typeof(document) = 'object')
);
do $$
declare table_name text;
begin
  foreach table_name in array array['diwan_cases','diwan_settings','diwan_classification_audit'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
    execute format('create policy diwan_owner_unlocked on public.%I for all to authenticated
      using ((select private.diwan_allowed())) with check ((select private.diwan_allowed()))',table_name);
  end loop;
end $$;

create function public.diwan_save_case(case_key text, patch jsonb, create_missing boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select private.diwan_allowed()) then raise insufficient_privilege; end if;
  if jsonb_typeof(patch) is distinct from 'object' then raise invalid_parameter_value; end if;
  if create_missing then
    insert into public.diwan_cases as c values (case_key, patch || jsonb_build_object('caseNumber',case_key))
    on conflict (case_number) do update set document = c.document || excluded.document;
  else
    update public.diwan_cases set document = document || (patch - 'caseNumber') where case_number = case_key;
    if not found then raise no_data_found; end if;
  end if;
end $$;
revoke all on function public.diwan_save_case(text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.diwan_save_case(text,jsonb,boolean) to authenticated;
commit;
