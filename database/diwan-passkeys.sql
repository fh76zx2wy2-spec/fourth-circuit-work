begin;

create table private.diwan_passkeys (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id),
  device_name text not null check (char_length(device_name) between 1 and 80),
  device_public_key jsonb not null,
  credential_id text not null unique,
  credential_public_key text not null,
  signature_counter bigint not null check (signature_counter >= 0),
  created_at timestamptz not null default clock_timestamp()
);

create table private.diwan_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  session_id uuid not null,
  kind text not null check (kind in ('register','authenticate')),
  device_id uuid not null,
  challenge text not null,
  data jsonb not null,
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
  claimed boolean not null default false,
  unique (session_id, kind)
);

alter table private.diwan_passkeys enable row level security;
alter table private.diwan_passkey_challenges enable row level security;
revoke all on private.diwan_passkeys, private.diwan_passkey_challenges from public, anon, authenticated, service_role;

create or replace function private.diwan_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from private.diwan_unlocks u where u.owner_id=private.diwan_owner()
      and u.session_id::text=auth.jwt()->>'session_id'
      and u.expires_at > statement_timestamp()
  )
$$;

-- The caller holds the account lock. Once a window starts, repeated explicit authentication
-- also leaves its deadline fixed. Only a fresh authentication after lock/expiry can start a new window.
create function private.diwan_open_hour(actor uuid, sid uuid) returns timestamptz
language plpgsql security invoker set search_path='' as $$
declare deadline timestamptz;
begin
  delete from private.diwan_unlocks u where u.owner_id=actor and u.expires_at<=clock_timestamp();
  insert into private.diwan_unlocks values (sid,actor,clock_timestamp() + interval '60 minutes')
    on conflict (session_id) do nothing;
  select u.expires_at into strict deadline from private.diwan_unlocks u where u.owner_id=actor and u.session_id=sid;
  return deadline;
end $$;
revoke all on function private.diwan_open_hour(uuid,uuid) from public,anon,authenticated,service_role;

create function private.diwan_access() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'status',case when private.diwan_owner() is null then 'forbidden'
      when u.expires_at > statement_timestamp() then 'unlocked'
      when exists(select from private.diwan_secret s where s.owner_id=private.diwan_owner()) then 'locked'
      else 'setup' end,
    'expiresAt',case when u.expires_at > statement_timestamp() then u.expires_at end,
    'remainingMs', greatest(0, floor(extract(epoch from (u.expires_at-statement_timestamp())) * 1000))
  ) from (select 1) x left join private.diwan_unlocks u
      on u.session_id::text=auth.jwt()->>'session_id' and u.owner_id=private.diwan_owner()
$$;

create function public.diwan_access() returns jsonb
language sql security invoker set search_path='' as $$ select private.diwan_access() $$;
revoke all on function public.diwan_access(), private.diwan_access() from public,anon,authenticated,service_role;
grant execute on function public.diwan_access(), private.diwan_access() to authenticated;

create or replace function private.diwan_gate(action text, code text, new_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.diwan_owner();
  current_session_id uuid;
  secret private.diwan_secret;
  recent timestamptz[];
  material text;
  crypto_schema text;
  valid boolean;
  active_until timestamptz;
begin
  if actor is null then return 'forbidden'; end if;
  current_session_id := (auth.jwt()->>'session_id')::uuid;
  if action = 'status' then
    if private.diwan_allowed() then return 'unlocked'; end if;
    if exists (select 1 from private.diwan_secret where owner_id = actor) then return 'locked'; end if;
    return 'setup';
  end if;
  if action is null then return 'invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('diwan:' || actor::text, 0));
  if action = 'lock' then
    delete from private.diwan_passkey_challenges c where c.session_id=current_session_id and c.owner_id=actor;
    delete from private.diwan_unlocks u where u.session_id = current_session_id and u.owner_id = actor;
    return 'locked';
  end if;
  if action not in ('setup','unlock','change','approve_device') or code is null or char_length(code) not between 8 and 128 then return 'invalid'; end if;
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
    if action = 'approve_device' then
      if not private.diwan_allowed() then return 'locked'; end if;
      return 'approved';
    end if;
    if action = 'change' then
      select u.expires_at into active_until from private.diwan_unlocks u
        where u.session_id=current_session_id and u.owner_id=actor;
      execute format('select %1$I.crypt(pg_catalog.encode(%1$I.digest($1, ''sha256''), ''hex''), %1$I.gen_salt(''bf'', 12))', crypto_schema)
        into material using new_code;
      update private.diwan_secret set passcode_hash=material where owner_id=actor;
      delete from private.diwan_passkey_challenges where owner_id=actor;
      delete from private.diwan_unlocks where owner_id=actor and session_id<>current_session_id;
      return case when active_until > clock_timestamp() then 'unlocked' else 'locked' end;
    end if;
  end if;
  perform private.diwan_open_hour(actor,current_session_id);
  return 'unlocked';
end
$$;

-- This RPC is restricted to the Edge function's service role. Registration requires an
-- independent passcode check in the Edge handler; challenge completion is one-time.
create function public.diwan_passkey_server(
  action text, actor uuid, sid uuid, payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target_device uuid;
  challenge_id uuid;
  challenge_kind text;
  enrolled private.diwan_passkeys;
  ceremony private.diwan_passkey_challenges;
begin
  if not exists (
    select from private.account_logins a
    join public.profiles p on p.id=a.user_id
    join auth.sessions s on s.user_id=p.id
    join auth.users u on u.id=p.id
    where a.username='ziyad' and p.id=actor and p.role='judge' and p.is_active
      and not u.is_anonymous and s.id=sid and (s.not_after is null or s.not_after>statement_timestamp())
  ) then return null; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('diwan:' || actor::text, 0));
  if action='identify' then return 'true'::jsonb; end if;
  if action='list' then
    if not exists (select from private.diwan_unlocks u where u.session_id=sid and u.owner_id=actor and u.expires_at>clock_timestamp()) then return null; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.device_name,'createdAt',d.created_at) order by d.created_at)
      from private.diwan_passkeys d where d.owner_id=actor),'[]'::jsonb);
  end if;
  target_device := (payload->>'deviceId')::uuid;
  if action='revoke' then
    if not exists (select from private.diwan_unlocks u where u.session_id=sid and u.owner_id=actor and u.expires_at>clock_timestamp()) then return null; end if;
    delete from private.diwan_passkey_challenges c where c.owner_id=actor and c.device_id=target_device;
    delete from private.diwan_passkeys d where d.id=target_device and d.owner_id=actor;
    if not found then return null; end if;
    -- Revocation also closes existing Diwan windows associated with any organizer session.
    delete from private.diwan_unlocks u where u.owner_id=actor;
    return 'true'::jsonb;
  end if;
  if action='device' then
    select d.* into enrolled from private.diwan_passkeys d where d.id=target_device and d.owner_id=actor;
    return case when found then to_jsonb(enrolled) end;
  end if;

  challenge_kind := payload->>'kind';
  if action='begin' then
    if challenge_kind='register' then
      if not exists (select from private.diwan_unlocks u where u.session_id=sid and u.owner_id=actor and u.expires_at>clock_timestamp())
        or (select count(*) from private.diwan_passkeys d where d.owner_id=actor) >= 12 then return null; end if;
    elsif challenge_kind='authenticate' then
      if not exists (select from private.diwan_passkeys d where d.id=target_device and d.owner_id=actor) then return null; end if;
    else return null;
    end if;
    delete from private.diwan_passkey_challenges c where c.owner_id=actor and c.expires_at<=clock_timestamp();
    insert into private.diwan_passkey_challenges as c (owner_id,session_id,kind,device_id,challenge,data)
      values (actor,sid,challenge_kind,target_device,payload->>'challenge',coalesce(payload->'data','{}'::jsonb))
      on conflict on constraint diwan_passkey_challenges_session_id_kind_key do update
        set id=gen_random_uuid(),device_id=excluded.device_id,challenge=excluded.challenge,data=excluded.data,
            expires_at=excluded.expires_at,claimed=false
      returning c.* into ceremony;
    return jsonb_build_object('id',ceremony.id);
  end if;

  challenge_id := (payload->>'challengeId')::uuid;
  if action='claim' then
    update private.diwan_passkey_challenges c set claimed=true
      where c.id=challenge_id and c.owner_id=actor and c.session_id=sid and c.kind=challenge_kind
        and c.expires_at>clock_timestamp() and not c.claimed
      returning c.* into ceremony;
    return case when found then to_jsonb(ceremony) end;
  end if;
  if action='finish' then
    delete from private.diwan_passkey_challenges c
      where c.id=challenge_id and c.owner_id=actor and c.session_id=sid and c.kind=challenge_kind
        and c.expires_at>clock_timestamp() and c.claimed
      returning c.* into ceremony;
    if not found then return null; end if;
    if challenge_kind='register' then
      if not exists (select from private.diwan_unlocks u where u.session_id=sid and u.owner_id=actor and u.expires_at>clock_timestamp())
        or (select count(*) from private.diwan_passkeys d where d.owner_id=actor) >= 12 then return null; end if;
      insert into private.diwan_passkeys
        (id,owner_id,device_name,device_public_key,credential_id,credential_public_key,signature_counter)
        values (ceremony.device_id,actor,ceremony.data->>'name',ceremony.data->'publicKey',
                payload->>'credentialId',payload->>'publicKey',(payload->>'counter')::bigint)
        on conflict do nothing;
      return case when found then 'true'::jsonb end;
    end if;
    update private.diwan_passkeys d set signature_counter=(payload->>'counter')::bigint
      where d.id=ceremony.device_id and d.owner_id=actor and d.credential_id=payload->>'credentialId'
      and d.signature_counter=(payload->>'previousCounter')::bigint;
    if not found then return null; end if;
    perform private.diwan_open_hour(actor,sid);
    return 'true'::jsonb;
  end if;
  return null;
end $$;
revoke all on function public.diwan_passkey_server(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.diwan_passkey_server(text,uuid,uuid,jsonb) to service_role;

commit;
