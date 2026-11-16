begin;

create table private.organizer_passkeys (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_name text not null check (char_length(device_name) between 1 and 80),
  device_public_key jsonb not null,
  credential_id text not null unique,
  credential_public_key text not null,
  signature_counter bigint not null check (signature_counter >= 0),
  created_at timestamptz not null default clock_timestamp()
);
create table private.organizer_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid,
  kind text not null check (kind in ('register','authenticate')),
  device_id uuid not null,
  challenge text not null,
  data jsonb not null,
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
  claimed boolean not null default false,
  unique (device_id,kind)
);
alter table private.organizer_passkeys enable row level security;
alter table private.organizer_passkey_challenges enable row level security;
revoke all on private.organizer_passkeys,private.organizer_passkey_challenges from public,anon,authenticated,service_role;

create function public.organizer_passkey_server(
  action text, actor uuid, sid uuid, payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner uuid;
  account_email text;
  device uuid;
  challenge_id uuid;
  flow_kind text := payload->>'kind';
  logged_in boolean;
  requires_session boolean;
  history timestamptz[];
  recent timestamptz[];
  account_credential text;
  pepper text;
  enrolled private.organizer_passkeys;
  ceremony private.organizer_passkey_challenges;
begin
  select p.id,u.email into owner,account_email
    from private.account_logins a join public.profiles p on p.id=a.user_id join auth.users u on u.id=p.id
    where a.username='ziyad' and p.role='judge' and p.is_active and not u.is_anonymous
      and u.email_confirmed_at is not null and u.email is not null
      and (u.banned_until is null or u.banned_until<=statement_timestamp());
  if owner is null then return null; end if;
  requires_session := action in ('identify','list','revoke') or flow_kind='register';
  logged_in := actor is not distinct from owner and exists (
    select from auth.sessions s where s.id=sid and s.user_id=owner
      and (s.not_after is null or s.not_after>statement_timestamp())
  );
  if requires_session and not logged_in then return null; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('organizer-passkey:'||owner::text,0));
  if action='identify' then return 'true'::jsonb; end if;
  if action='list' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.device_name,'createdAt',d.created_at) order by d.created_at)
      from private.organizer_passkeys d where d.owner_id=owner),'[]'::jsonb);
  end if;
  device := (payload->>'deviceId')::uuid;
  if action='revoke' then
    delete from private.organizer_passkey_challenges c where c.owner_id=owner and c.device_id=device;
    delete from private.organizer_passkeys d where d.id=device and d.owner_id=owner;
    return case when found then 'true'::jsonb end;
  end if;
  if action='device' then
    select d.* into enrolled from private.organizer_passkeys d where d.id=device and d.owner_id=owner;
    return case when found then to_jsonb(enrolled) end;
  end if;
  if action='begin' then
    if flow_kind='register' then
      if payload->>'password' is null or char_length(payload->>'password') not between 1 and 128 then return null; end if;
      select a.attempted_at into history from private.account_logins a where a.username='ziyad' and a.user_id=owner for update;
      recent := array(select t from unnest(history) t where t>clock_timestamp()-interval '5 minutes');
      if cardinality(recent)>=5 then return jsonb_build_object('limited',true); end if;
      update private.account_logins set attempted_at=array_append(recent,clock_timestamp()) where username='ziyad' and user_id=owner;
      select s.decrypted_secret into pepper from vault.decrypted_secrets s where s.name='account_login_pepper';
      account_credential := pg_catalog.encode(extensions.hmac('ziyad:'||(payload->>'password'),pepper,'sha256'),'hex');
      if not exists (select from auth.users u where u.id=owner and extensions.crypt(account_credential,u.encrypted_password)=u.encrypted_password) then return null; end if;
      if (select count(*) from private.organizer_passkeys d where d.owner_id=owner)>=12
         or (select count(*) from private.organizer_passkey_challenges c where c.owner_id=owner
              and c.kind='register' and c.expires_at>clock_timestamp())>=12 then return null; end if;
    elsif flow_kind='authenticate' then
      if not exists (select from private.organizer_passkeys d where d.id=device and d.owner_id=owner) then return null; end if;
    else return null;
    end if;
    delete from private.organizer_passkey_challenges c where c.owner_id=owner and c.expires_at<=clock_timestamp();
    insert into private.organizer_passkey_challenges as c (owner_id,session_id,kind,device_id,challenge,data)
      values (owner,case when flow_kind='register' then sid end,flow_kind,device,payload->>'challenge',coalesce(payload->'data','{}'::jsonb))
      on conflict on constraint organizer_passkey_challenges_device_id_kind_key do update
        set id=gen_random_uuid(),session_id=excluded.session_id,challenge=excluded.challenge,data=excluded.data,
            expires_at=excluded.expires_at,claimed=false
      returning c.* into ceremony;
    return jsonb_build_object('id',ceremony.id);
  end if;
  challenge_id := (payload->>'challengeId')::uuid;
  if action='claim' then
    update private.organizer_passkey_challenges c set claimed=true
      where c.id=challenge_id and c.owner_id=owner and c.kind=flow_kind
        and (flow_kind='authenticate' or c.session_id=sid) and c.expires_at>clock_timestamp() and not c.claimed
      returning c.* into ceremony;
    return case when found then to_jsonb(ceremony) end;
  end if;
  if action='finish' then
    delete from private.organizer_passkey_challenges c
      where c.id=challenge_id and c.owner_id=owner and c.kind=flow_kind
        and (flow_kind='authenticate' or c.session_id=sid) and c.expires_at>clock_timestamp() and c.claimed
      returning c.* into ceremony;
    if not found then return null; end if;
    if flow_kind='register' then
      if (select count(*) from private.organizer_passkeys d where d.owner_id=owner)>=12 then return null; end if;
      insert into private.organizer_passkeys
        (id,owner_id,device_name,device_public_key,credential_id,credential_public_key,signature_counter)
        values (ceremony.device_id,owner,ceremony.data->>'name',ceremony.data->'publicKey',
                payload->>'credentialId',payload->>'publicKey',(payload->>'counter')::bigint)
        on conflict do nothing;
      return case when found then 'true'::jsonb end;
    end if;
    update private.organizer_passkeys d set signature_counter=(payload->>'counter')::bigint
      where d.id=ceremony.device_id and d.owner_id=owner and d.credential_id=payload->>'credentialId'
      and d.signature_counter=(payload->>'previousCounter')::bigint;
    if not found then return null; end if;
    return jsonb_build_object('id',owner,'email',account_email);
  end if;
  return null;
end $$;
revoke all on function public.organizer_passkey_server(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.organizer_passkey_server(text,uuid,uuid,jsonb) to service_role;

commit;
