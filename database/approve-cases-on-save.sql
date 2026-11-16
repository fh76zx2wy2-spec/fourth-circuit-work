begin;

create or replace function private.guard_case_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_active_user() then
    raise exception 'User is not active' using errcode = '42501';
  end if;
  if tg_op='UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.deleted_at is null then
    new.status := 'approved';
    if tg_op='UPDATE' and old.status='approved' and old.deleted_at is null
       and private.case_contents(new) is not distinct from private.case_contents(old) then
      new.approved_at := coalesce(old.approved_at,now());
      new.approved_by := old.approved_by;
    else
      new.approved_at := now();
      new.approved_by := null;
    end if;
  elsif tg_op='UPDATE' then
    new.status := old.status;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  else
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

create or replace function private.guard_case_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' or new.session_time is distinct from old.session_time then
    if new.session_time < time '08:00' or new.session_time > time '14:00'
       or extract(epoch from new.session_time)::numeric % 300 <> 0 then
      raise exception 'case_working_hours' using errcode = '23514';
    end if;
  end if;
  if new.deleted_at is null and new.stage='followup' and new.session_number is null then
    raise exception 'case_session_number_required' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Backfill only complete scheduled cases. Keep report approvals and prior audit metadata intact.
alter table public.cases disable trigger check_case_write;
alter table public.cases disable trigger invalidate_reports_after_case;
alter table public.cases disable trigger notify_cases_on_write;
update public.cases
set status='approved', approved_at=now(), approved_by=null
where deleted_at is null and status <> 'approved'
  and session_date is not null and session_time is not null
  and stage in ('first','followup')
  and not exists (
    select from unnest(array[case_number,plaintiffs,defendants,case_type,claim_summary]) f(value)
    where not coalesce(f.value ~ '[^[:space:]  　﻿]',false)
  )
  and (stage='first' or (session_number is not null and previous_date is not null
    and coalesce(previous_minutes ~ '[^[:space:]  　﻿]',false)));
alter table public.cases enable trigger check_case_write;
alter table public.cases enable trigger invalidate_reports_after_case;
alter table public.cases enable trigger notify_cases_on_write;

commit;
