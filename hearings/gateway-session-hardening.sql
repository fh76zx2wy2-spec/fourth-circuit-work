create table if not exists private.hearings_gateway_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(user_id),
  expires_at timestamptz not null
);
alter table private.hearings_gateway_sessions enable row level security;
revoke all on private.hearings_gateway_sessions from public, anon, authenticated;
create or replace function public.register_hearings_gateway_session(p_session_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select from auth.sessions where id=p_session_id and user_id=p_user_id) then
    raise exception 'invalid_hearings_session';
  end if;
  delete from private.hearings_gateway_sessions where expires_at <= now();
  insert into private.hearings_gateway_sessions(session_id,user_id,expires_at)
  values(p_session_id,p_user_id,now()+interval '2 minutes');
end;
$$;
revoke all on function public.register_hearings_gateway_session(uuid,uuid) from public, anon, authenticated;
grant execute on function public.register_hearings_gateway_session(uuid,uuid) to service_role;
CREATE OR REPLACE FUNCTION public.restore_backup(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ begin
  if auth.uid() is null or private.current_role() is distinct from 'admin' then raise exception 'admin_required'; end if;
  if p_payload->>'format'<>'fourth-circuit-backup' or (p_payload->>'version')::int<>3 then raise exception 'invalid_backup'; end if;
  insert into public.hearing_days(id,hearing_date,status,version,created_by,updated_by,created_at,updated_at,approved_by,approved_at)
  select id,hearing_date,status,version,auth.uid(),auth.uid(),created_at,now(),null,approved_at from jsonb_to_recordset(p_payload#>'{data,hearing_days}') as x(id uuid,hearing_date date,status public.day_status,version bigint,created_by uuid,updated_by uuid,created_at timestamptz,updated_at timestamptz,approved_by uuid,approved_at timestamptz)
  on conflict(hearing_date) do update set status=excluded.status,updated_by=auth.uid(),updated_at=now();
  insert into public.hearings(id,day_id,position,starts_at,ends_at,original_assignee_id,actual_assignee_id,status,version,updated_by,created_at,updated_at)
  select id,day_id,position,starts_at,ends_at,original_assignee_id,actual_assignee_id,status,version,auth.uid(),created_at,now() from jsonb_to_recordset(p_payload#>'{data,hearings}') as x(id uuid,day_id uuid,position smallint,starts_at time,ends_at time,original_assignee_id uuid,actual_assignee_id uuid,status public.hearing_status,version bigint,updated_by uuid,created_at timestamptz,updated_at timestamptz)
  on conflict(id) do update set position=excluded.position,starts_at=excluded.starts_at,ends_at=excluded.ends_at,original_assignee_id=excluded.original_assignee_id,actual_assignee_id=excluded.actual_assignee_id,status=excluded.status,updated_by=auth.uid();
  insert into public.day_absences(day_id,employee_id,created_by,created_at)
  select day_id,employee_id,auth.uid(),created_at from jsonb_to_recordset(p_payload#>'{data,day_absences}') as x(day_id uuid,employee_id uuid,created_by uuid,created_at timestamptz) on conflict do nothing;
  insert into public.apologies(id,hearing_id,original_employee_id,replacement_employee_id,reason,is_active,version,created_by,updated_by,created_at,updated_at)
  select id,hearing_id,original_employee_id,replacement_employee_id,reason,is_active,version,auth.uid(),auth.uid(),created_at,now() from jsonb_to_recordset(p_payload#>'{data,apologies}') as x(id uuid,hearing_id uuid,original_employee_id uuid,replacement_employee_id uuid,reason text,is_active boolean,version bigint,created_by uuid,updated_by uuid,created_at timestamptz,updated_at timestamptz)
  on conflict(hearing_id) do update set replacement_employee_id=excluded.replacement_employee_id,reason=excluded.reason,is_active=excluded.is_active,updated_by=auth.uid();
end $function$;
create or replace function private.reject_hearings_signup() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'New registrations are disabled for hearing distribution' using errcode='42501';
end;
$$;
create trigger reject_hearings_signup before insert on auth.users
for each row execute function private.reject_hearings_signup();

create or replace function private."current_role"()
returns public.app_role language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  join private.hearings_gateway_sessions s on s.user_id=p.user_id
  where p.user_id=(select auth.uid())
    and s.session_id::text=(select auth.jwt()->>'session_id')
    and s.expires_at>now();
$$;
create or replace function private.can_approve()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.role='admin' or p.can_approve from public.profiles p
  where p.user_id=(select auth.uid()) and private."current_role"() is not null),false);
$$;
