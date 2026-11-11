alter table public.cases add column session_number smallint
  constraint cases_session_number_check
  check (session_number is null or (session_number between 2 and 100 and stage = 'followup'));

create table private.pending_case_submissions (
  case_id uuid primary key references public.cases(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade
);
create index pending_case_submissions_actor_idx on private.pending_case_submissions(actor_id);

create table public.case_submissions (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  session_date date not null,
  sent_at timestamptz not null default now(),
  added_count integer not null default 0,
  edited_count integer not null default 0,
  case_ids uuid[] not null default '{}'
);

alter table public.case_submissions enable row level security;
revoke all on public.case_submissions from public, anon, authenticated;
grant select on public.case_submissions to authenticated;

create function private.is_submission_sender(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.profiles where id = person and is_active and role = 'secretary'
    and display_name in ('يحيى محمد إبراهيم بكري', 'عبد الرحمن يحيى علي الشريف')
  )
$$;

create function private.is_submission_recipient(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.profiles where id = person and is_active and role = 'judge'
    and display_name = 'زياد محمد البابطين'
  )
$$;

revoke all on function private.is_submission_sender(uuid), private.is_submission_recipient(uuid) from public, anon, authenticated;
grant execute on function private.is_submission_sender(uuid), private.is_submission_recipient(uuid) to authenticated;

create policy read_case_submissions on public.case_submissions for select to authenticated
  using (actor_id = (select auth.uid()) or (select private.is_submission_recipient(auth.uid())));

alter table public.notifications add column submission_id uuid references public.case_submissions(id);
create unique index notifications_submission_recipient_idx
  on public.notifications(submission_id, recipient_id) where submission_id is not null;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('created','updated','approved','removed','submitted'));

create function private.case_contents(record public.cases) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(record) - array['status','approved_at','approved_by','created_at','created_by','updated_at','updated_by']
$$;

create function private.guard_case_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare content_changed boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    content_changed := private.case_contents(new) is distinct from private.case_contents(old);
  end if;
  if tg_op = 'INSERT' or new.session_time is distinct from old.session_time then
    if new.session_time < time '08:00' or new.session_time > time '14:00'
       or extract(epoch from new.session_time)::numeric % 300 <> 0 then
      raise exception 'case_working_hours' using errcode = '23514';
    end if;
  end if;
  if content_changed and new.deleted_at is null and new.stage = 'followup' and new.session_number is null then
    raise exception 'case_session_number_required' using errcode = '23514';
  end if;
  if private.is_submission_sender(auth.uid()) and new.deleted_at is null and (
    content_changed or exists(select from private.pending_case_submissions where case_id = new.id)
  ) then
    new.status := 'draft';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  if private.is_submission_recipient(auth.uid()) and new.status = 'approved' and new.deleted_at is null
     and exists(select from private.pending_case_submissions where case_id = new.id) then
    raise exception 'case_waiting_for_submission';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'approved'
     and new.session_number is distinct from old.session_number then
    new.status := 'ready';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end $$;

create trigger zz_guard_case_submission before insert or update on public.cases
for each row execute function private.guard_case_submission();

create or replace function private.log_revision_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  event_kind text;
  actor uuid := new.updated_by;
  actor_name text;
  sender boolean := private.is_submission_sender(new.updated_by);
begin
  if tg_op = 'UPDATE' then
    if sender and private.case_contents(new) = private.case_contents(old)
       and old.status = 'draft' and new.status = 'ready' then return new; end if;
    insert into public.case_revisions(case_id,changed_by,old_record)
    values(old.id,(select auth.uid()),to_jsonb(old));
  end if;

  if new.deleted_at is not null then
    delete from private.pending_case_submissions where case_id = new.id;
  elsif sender and (tg_op = 'INSERT' or private.case_contents(new) is distinct from private.case_contents(old)) then
    insert into private.pending_case_submissions(case_id,actor_id) values(new.id,actor)
    on conflict(case_id) do update set actor_id = excluded.actor_id;
  end if;

  select display_name into actor_name from public.profiles where id=actor;
  if tg_op='INSERT' then event_kind:='created';
  elsif new.deleted_at is not null and old.deleted_at is null then event_kind:='removed';
  elsif new.status='approved' and old.status is distinct from new.status then event_kind:='approved';
  else event_kind:='updated'; end if;
  insert into public.notifications(recipient_id,actor_id,case_id,kind,message)
  select id,actor,new.id,event_kind,
    coalesce(actor_name,'أحد الموظفين') ||
    case event_kind when 'created' then ' أضاف القضية ' when 'approved' then ' اعتمد القضية '
      when 'removed' then ' أزال القضية ' else ' حدّث القضية ' end || new.case_number
  from public.profiles where is_active and id is distinct from actor
    and (not sender or role <> 'judge' or event_kind = 'removed');
  return new;
end $$;

create function public.submit_cases_for_judge(day date, request_id uuid)
returns public.case_submissions
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  sender_name text;
  short_name text;
  weekday text;
  message text;
  had_submission boolean;
  candidate uuid;
  submitted public.case_submissions;
begin
  if not private.is_submission_sender(actor) then raise exception 'submission_forbidden' using errcode = '42501'; end if;
  if day is null or request_id is null then raise exception 'invalid_submission' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  select * into submitted from public.case_submissions where id = request_id;
  if found then
    if submitted.actor_id <> actor or submitted.session_date <> day then
      raise exception 'invalid_submission' using errcode = '22023';
    end if;
    return submitted;
  end if;

  select display_name into sender_name from public.profiles where id = actor;
  short_name := case when sender_name like 'يحيى %' then 'يحيى' else 'عبد الرحمن' end;
  weekday := (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from day)::int + 1];
  had_submission := exists(select from public.case_submissions where actor_id = actor and session_date = day);
  submitted.case_ids := '{}';
  submitted.added_count := 0;
  submitted.edited_count := 0;

  for candidate in
    select c.id from public.cases c join private.pending_case_submissions p on p.case_id = c.id
    where c.session_date = day and c.deleted_at is null and p.actor_id = actor
    order by c.id for update of c
  loop
    delete from private.pending_case_submissions where case_id = candidate and actor_id = actor;
    if not found then continue; end if;
    if exists(select from public.case_submissions where case_ids @> array[candidate]) then
      submitted.edited_count := submitted.edited_count + 1;
    else
      submitted.added_count := submitted.added_count + 1;
    end if;
    submitted.case_ids := array_append(submitted.case_ids,candidate);
    update public.cases set status = 'ready' where id = candidate and status = 'draft';
  end loop;
  if cardinality(submitted.case_ids) = 0 then return null; end if;

  insert into public.case_submissions(id,actor_id,actor_name,session_date,added_count,edited_count,case_ids)
  values(request_id,actor,sender_name,day,submitted.added_count,submitted.edited_count,submitted.case_ids)
  returning * into submitted;
  message := case
    when submitted.added_count = 0 then format('%s اعتمد إرسال تعديلات على %s من القضايا لجلسات %s', short_name, submitted.edited_count, weekday)
    when submitted.edited_count > 0 then format('%s اعتمد إرسال %s من القضايا الجديدة وتعديلات على %s لجلسات %s', short_name, submitted.added_count, submitted.edited_count, weekday)
    when had_submission then format('%s اعتمد إضافة %s من القضايا بعد الإرسال السابق لجلسات %s', short_name, submitted.added_count, weekday)
    else format('%s اعتمد إرسال %s من القضايا لجلسات %s', short_name, submitted.added_count, weekday)
  end;

  insert into public.notifications(recipient_id,actor_id,kind,message,submission_id)
  select id,actor,'submitted',message,submitted.id from public.profiles where private.is_submission_recipient(id);
  return submitted;
end $$;

create index case_submissions_case_ids_idx on public.case_submissions using gin(case_ids);
create index case_submissions_actor_day_idx on public.case_submissions(actor_id,session_date);
revoke all on function public.submit_cases_for_judge(date,uuid) from public, anon, authenticated;
grant execute on function public.submit_cases_for_judge(date,uuid) to authenticated;
