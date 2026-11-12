create function public.approve_session_cases(session_day date, case_ids uuid[])
returns table(case_id uuid, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  candidate public.cases;
  requested_id uuid;
begin
  if not coalesce(private.is_judge(), false) then
    raise exception 'judge_required' using errcode = '42501';
  end if;
  if session_day is null or case_ids is null then
    raise exception 'invalid_approval_selection' using errcode = '22023';
  end if;

  for requested_id in select distinct id from unnest(case_ids) ids(id) where id is not null order by id
  loop
    case_id := requested_id;
    select * into candidate from public.cases c where c.id = requested_id for update;
    if not found or candidate.deleted_at is not null or candidate.session_date <> session_day then
      reason := 'unavailable';
    elsif candidate.status = 'approved' then
      reason := 'already_approved';
    elsif candidate.status <> 'ready' or exists (
      select from private.pending_case_submissions p where p.case_id = requested_id
    ) then
      reason := 'not_sent';
    else
      begin
        update public.cases c set status = 'approved', updated_by = actor where c.id = requested_id;
        reason := 'approved';
      exception when check_violation then
        reason := case sqlerrm
          when 'case_required_fields' then 'required_fields'
          when 'case_previous_session_required' then 'previous_session'
          when 'case_session_number_required' then 'session_number'
          else 'invalid_case'
        end;
      end;
    end if;
    return next;
  end loop;
end $$;

revoke all on function public.approve_session_cases(date,uuid[]) from public, anon, authenticated;
grant execute on function public.approve_session_cases(date,uuid[]) to authenticated;

create or replace function private.guard_case_submission() returns trigger
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
  if (content_changed or (tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved'))
     and new.deleted_at is null and new.stage = 'followup' and new.session_number is null then
    raise exception 'case_session_number_required' using errcode = '23514';
  end if;
  if private.is_submission_sender(auth.uid()) and new.deleted_at is null and (
    content_changed or exists(select from private.pending_case_submissions where case_id = new.id)
  ) then
    new.status := 'draft';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'approved'
     and new.session_number is distinct from old.session_number then
    new.status := 'ready';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved'
     and new.deleted_at is null and (old.status <> 'ready' or exists (
       select from private.pending_case_submissions where case_id = new.id
     )) then
    raise exception 'case_waiting_for_submission' using errcode = '23514';
  end if;
  return new;
end $$;
