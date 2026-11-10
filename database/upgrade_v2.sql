-- إصدار 2: قائمة المتابعة + اعتماد التقرير اليومي.
-- تحديث قيد نوع المستخدم لاستيعاب أمين السر في النسخ المثبتة سابقا.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('judge','writer','secretary'));
-- يُنفّذ بعد setup.sql، وفي مشروع Supabase مستقل خاص بهذا الموقع فقط.
-- لا يوضع هذا الملف في موقع علني مرتبط ببيانات فعلية قبل اعتماد بيئة الاستضافة.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 3 and 220),
  category text not null default 'general' check(category in ('case','email','ticket','followup','general')),
  case_number text not null default '',
  details text not null default '',
  due_date date,
  priority text not null default 'normal' check(priority in ('normal','urgent','low')),
  status text not null default 'open' check(status in ('open','done')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists tasks_pending_idx on public.tasks(status,due_date,created_at desc) where deleted_at is null;

create table if not exists public.task_revisions (
  id bigint generated always as identity primary key,
  task_id uuid not null,
  changed_by uuid references public.profiles(id),
  old_record jsonb not null,
  changed_at timestamptz not null default now()
);

create table if not exists public.report_approvals (
 session_date date primary key,
 approved_at timestamptz,
 approved_by uuid references public.profiles(id),
 case_count integer not null default 0,
 updated_at timestamptz not null default now()
);

create or replace function private.guard_task_write() returns trigger language plpgsql security definer set search_path = '' as $$
declare acting_role text;
begin
 select role into acting_role from public.profiles where id=(select auth.uid()) and is_active;
 if acting_role is null then raise exception 'Inactive account'; end if;
 if TG_OP='UPDATE' then
   new.created_by:=old.created_by; new.created_at:=old.created_at;
   if new.status is distinct from old.status and acting_role<>'judge' then
     raise exception 'Only the judge can change task completion';
   end if;
 end if;
 new.updated_by:=(select auth.uid()); new.updated_at:=now();
 if new.status='done' then
   if TG_OP='INSERT' and acting_role<>'judge' then raise exception 'Only the judge can complete tasks'; end if;
   new.completed_by:=coalesce(case when TG_OP='UPDATE' and old.status='done' then old.completed_by end,(select auth.uid()));
   new.completed_at:=coalesce(case when TG_OP='UPDATE' and old.status='done' then old.completed_at end,now());
 else
   new.completed_by:=null;new.completed_at:=null;
 end if;
 return new;
end; $$;
drop trigger if exists guard_task_write on public.tasks;
create trigger guard_task_write before insert or update on public.tasks for each row execute function private.guard_task_write();

create or replace function private.notify_task_write() returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_name text; ev text;
begin
 if TG_OP='UPDATE' then
  insert into public.task_revisions(task_id,changed_by,old_record) values(old.id,(select auth.uid()),to_jsonb(old));
 end if;
 select display_name into actor_name from public.profiles where id=new.updated_by;
 ev := case when TG_OP='INSERT' then 'أضاف مهمة' when new.deleted_at is not null and old.deleted_at is null then 'أزال مهمة' when new.status='done' and old.status is distinct from new.status then 'أنجز مهمة' when new.status='open' and old.status='done' then 'أعاد فتح مهمة' else 'عدّل مهمة' end;
 insert into public.notifications(recipient_id,actor_id,case_id,kind,message)
 select id,new.updated_by,null,'updated', left(coalesce(actor_name,'أحد الموظفين')||' '||ev||': '||new.title,450)
 from public.profiles where is_active=true and id is distinct from new.updated_by;
 return new;
end; $$;
drop trigger if exists notify_task_write on public.tasks;
create trigger notify_task_write after insert or update on public.tasks for each row execute function private.notify_task_write();

create or replace function private.guard_report_write() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 -- Only nested invalidations from case trigger may clear an approval without judge login.
 if TG_OP='UPDATE' and old.approved_at is not null and new.approved_at is null and pg_trigger_depth()>1 then
  new.approved_by:=null; new.updated_at:=now(); return new;
 end if;
 if not (select private.is_judge()) then raise exception 'Only judge may approve report'; end if;
 if new.approved_at is not null then
   if exists(select 1 from public.cases where session_date=new.session_date and deleted_at is null and status<>'approved') then
    raise exception 'Approve all cases before approving daily report';
   end if;
   new.approved_at:=now(); new.approved_by:=(select auth.uid());
   new.case_count:=(select count(*) from public.cases where session_date=new.session_date and deleted_at is null);
 end if;
 new.updated_at:=now();return new;
end; $$;
drop trigger if exists guard_report_write on public.report_approvals;
create trigger guard_report_write before insert or update on public.report_approvals for each row execute function private.guard_report_write();

-- Invalidate final report approval when any included case gets inserted/updated/removed.
create or replace function private.invalidate_reports() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.report_approvals set approved_at=null,approved_by=null,updated_at=now() where session_date=new.session_date and approved_at is not null;
 if TG_OP='UPDATE' and old.session_date is distinct from new.session_date then
  update public.report_approvals set approved_at=null,approved_by=null,updated_at=now() where session_date=old.session_date and approved_at is not null;
 end if;
 return new;
end; $$;
drop trigger if exists invalidate_reports_after_case on public.cases;
create trigger invalidate_reports_after_case after insert or update on public.cases for each row execute function private.invalidate_reports();

alter table public.tasks enable row level security;
alter table public.task_revisions enable row level security;
alter table public.report_approvals enable row level security;

drop policy if exists task_read on public.tasks;
create policy task_read on public.tasks for select to authenticated using((select private.is_active_user()));
drop policy if exists task_insert on public.tasks;
create policy task_insert on public.tasks for insert to authenticated with check((select private.is_active_user()) and created_by=(select auth.uid()));
drop policy if exists task_update on public.tasks;
create policy task_update on public.tasks for update to authenticated using((select private.is_active_user())) with check((select private.is_active_user()));
drop policy if exists task_revisions_read on public.task_revisions;
create policy task_revisions_read on public.task_revisions for select to authenticated using((select private.is_active_user()));
drop policy if exists report_read on public.report_approvals;
create policy report_read on public.report_approvals for select to authenticated using((select private.is_active_user()));
drop policy if exists report_insert on public.report_approvals;
create policy report_insert on public.report_approvals for insert to authenticated with check((select private.is_judge()));
drop policy if exists report_update on public.report_approvals;
create policy report_update on public.report_approvals for update to authenticated using((select private.is_judge())) with check((select private.is_judge()));

revoke all on public.tasks,public.task_revisions,public.report_approvals from anon;
grant select,insert,update on public.tasks to authenticated;
grant select on public.task_revisions to authenticated;
grant select,insert,update on public.report_approvals to authenticated;

do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tasks') then
  alter publication supabase_realtime add table public.tasks;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='report_approvals') then
  alter publication supabase_realtime add table public.report_approvals;
 end if;
end$$;
