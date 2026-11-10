-- التحضير القضائي - قاعدة بيانات مستقلة تمامًا عن أي مشروع آخر.
-- شغّل هذا الملف فقط في مشروع Supabase جديد مخصص للتطبيق.
-- تُنشأ الحسابات عبر Supabase Auth؛ ويظل كل حساب جديد غير فعّال حتى الموافقة اليدوية.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'مستخدم',
 email text,
 role text not null default 'writer' check (role in ('judge','writer','secretary')),
 is_active boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists profiles_is_active_idx on public.profiles(is_active);

-- Authorization functions: isolated from the exposed Data API and with fixed search path.
create or replace function private.is_active_user() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and is_active=true);
$$;
create or replace function private.is_judge() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and is_active=true and role='judge');
$$;
revoke all on function private.is_active_user() from public, anon;
revoke all on function private.is_judge() from public, anon;
grant execute on function private.is_active_user(),private.is_judge() to authenticated;

create or replace function private.add_new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,display_name,email,role,is_active)
 values(new.id, left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'مستخدم'),100),new.email,'writer',false)
 on conflict (id) do nothing;
 return new;
end;
$$;
drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup after insert on auth.users for each row execute function private.add_new_profile();
-- Backfill if users already exist in this NEW project.
insert into public.profiles(id,display_name,email,role,is_active)
select id, left(coalesce(nullif(raw_user_meta_data->>'display_name',''),'مستخدم'),100),email,'writer',false from auth.users
on conflict(id) do nothing;

create table if not exists public.cases (
 id uuid primary key default gen_random_uuid(),
 case_number text not null check(length(trim(case_number)) between 2 and 60),
 session_date date not null,
 session_time time not null,
 plaintiffs text not null,
 defendants text not null,
 case_type text not null,
 claim_summary text not null default '',
 claim_requests text not null default '',
 stage text not null default 'followup' check(stage in ('first','followup')),
 previous_date date,
 previous_minutes text not null default '',
 last_session_summary text not null default '',
 adjournment_reason text not null default '',
 reason_evidence_quote text not null default '',
 next_action text not null default '',
 summary_warning text not null default '',
 summary_mode text not null default 'manual' check(summary_mode in ('manual','automatic','ai')),
 status text not null default 'draft' check(status in ('draft','ready','approved')),
 approved_at timestamptz,
 approved_by uuid references public.profiles(id),
 created_by uuid not null references public.profiles(id),
 updated_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 constraint evidence_must_match_source check(reason_evidence_quote='' or strpos(previous_minutes,reason_evidence_quote)>0)
);
create unique index if not exists unique_active_case_date on public.cases(case_number,session_date) where deleted_at is null;
create index if not exists cases_schedule_idx on public.cases(session_date,session_time) where deleted_at is null;

create table if not exists public.case_revisions (
 id bigint generated always as identity primary key,
 case_id uuid not null,
 changed_by uuid references public.profiles(id),
 old_record jsonb not null,
 changed_at timestamptz not null default now()
);
create index if not exists revisions_case_idx on public.case_revisions(case_id,changed_at desc);

create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid references public.profiles(id),
 case_id uuid,
 kind text not null check(kind in ('created','updated','approved','removed')),
 message text not null,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id,created_at desc);

create or replace function private.guard_case_write() returns trigger language plpgsql security definer set search_path = '' as $$
declare acting_role text;
begin
 select role into acting_role from public.profiles where id=(select auth.uid()) and is_active;
 if acting_role is null then raise exception 'User is not active'; end if;
 if TG_OP='UPDATE' then
   new.created_by:=old.created_by;
   new.created_at:=old.created_at;
   -- Any change that is not just an approval removes the prior approval.
   if old.status='approved' and (
       row(new.case_number,new.session_date,new.session_time,new.plaintiffs,new.defendants,new.case_type,new.claim_summary,new.claim_requests,new.stage,new.previous_date,new.previous_minutes,new.last_session_summary,new.adjournment_reason,new.reason_evidence_quote,new.next_action,new.summary_warning,new.deleted_at)
       is distinct from
       row(old.case_number,old.session_date,old.session_time,old.plaintiffs,old.defendants,old.case_type,old.claim_summary,old.claim_requests,old.stage,old.previous_date,old.previous_minutes,old.last_session_summary,old.adjournment_reason,old.reason_evidence_quote,old.next_action,old.summary_warning,old.deleted_at)
     ) then
     new.status:='ready';
   end if;
 end if;
 new.updated_by:=(select auth.uid());
 new.updated_at:=now();
 if new.status='approved' then
   if acting_role<>'judge' then raise exception 'Only judge can approve'; end if;
   if new.stage='followup' and trim(new.previous_minutes)='' then raise exception 'Previous minutes are needed to approve'; end if;
   new.approved_at:=coalesce(case when TG_OP='UPDATE' and old.status='approved' then old.approved_at end,now());
   new.approved_by:=(select auth.uid());
 else
   new.approved_at:=null;
   new.approved_by:=null;
 end if;
 return new;
end;
$$;
drop trigger if exists check_case_write on public.cases;
create trigger check_case_write before insert or update on public.cases for each row execute function private.guard_case_write();

create or replace function private.log_revision_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare event_kind text; actor uuid; actor_name text; record_num text;
begin
 if TG_OP='UPDATE' then
   insert into public.case_revisions(case_id,changed_by,old_record) values(old.id,(select auth.uid()),to_jsonb(old));
 end if;
 actor := new.updated_by;
 select display_name into actor_name from public.profiles where id=actor;
 record_num:=new.case_number;
 if TG_OP='INSERT' then event_kind:='created';
 elsif new.deleted_at is not null and old.deleted_at is null then event_kind:='removed';
 elsif new.status='approved' and old.status is distinct from new.status then event_kind:='approved';
 else event_kind:='updated'; end if;
 insert into public.notifications(recipient_id,actor_id,case_id,kind,message)
 select id,actor,new.id,event_kind,
 coalesce(actor_name,'أحد الموظفين') ||
 case event_kind when 'created' then ' أضاف القضية ' when 'approved' then ' اعتمد القضية ' when 'removed' then ' أزال القضية ' else ' حدّث القضية ' end || record_num
 from public.profiles where is_active=true and id is distinct from actor;
 return new;
end;
$$;
drop trigger if exists notify_cases_on_write on public.cases;
create trigger notify_cases_on_write after insert or update on public.cases for each row execute function private.log_revision_notify();

-- All exposed tables must be RLS protected.
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_revisions enable row level security;
alter table public.notifications enable row level security;

-- Only the user's own profile is shown before activation.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
 using(id=(select auth.uid()) or (select private.is_active_user()));

-- Active members of this private circuit can read/write cases; approval is guarded by trigger.
drop policy if exists cases_read on public.cases;
create policy cases_read on public.cases for select to authenticated using ((select private.is_active_user()));
drop policy if exists cases_add on public.cases;
create policy cases_add on public.cases for insert to authenticated with check((select private.is_active_user()) and created_by=(select auth.uid()));
drop policy if exists cases_edit on public.cases;
create policy cases_edit on public.cases for update to authenticated
 using((select private.is_active_user())) with check((select private.is_active_user()));

-- Revision history is immutable from the client.
drop policy if exists revisions_read on public.case_revisions;
create policy revisions_read on public.case_revisions for select to authenticated using((select private.is_active_user()));

-- Notifications readable only by the recipient; writes only from server triggers.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using(recipient_id=(select auth.uid()) and (select private.is_active_user()));
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications for update to authenticated
 using(recipient_id=(select auth.uid()) and (select private.is_active_user()))
 with check(recipient_id=(select auth.uid()) and (select private.is_active_user()));
-- No user is granted DELETE/INSERT privileges on notifications. Prefer a dedicated RPC to mark read
-- if the app is extended; RLS still prevents access to other recipients.

revoke all on public.profiles,public.cases,public.case_revisions,public.notifications from anon;
grant select on public.profiles to authenticated;
grant select,insert,update on public.cases to authenticated;
grant select on public.case_revisions to authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

-- Enable realtime notifications. These tables remain protected by RLS.
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cases') then
  alter publication supabase_realtime add table public.cases;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
  alter publication supabase_realtime add table public.notifications;
 end if;
end$$;

-- BOOTSTRAP: بعد تسجيل حسابك، نفّذ من SQL Editor (وليس من الموقع):
-- update public.profiles set role='judge',is_active=true where email='YOUR_EMAIL';
-- لتفعيل كاتب (بعد إنشاء حسابه):
-- update public.profiles set role='writer',is_active=true where email='WRITER_EMAIL';
-- لا تنس تعطيل التسجيل المفتوح من Supabase Auth بعد إنشاء الحسابات اللازمة إن أمكن.
