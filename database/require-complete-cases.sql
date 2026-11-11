create or replace function private.require_complete_case()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Existing rows can still be removed from the active schedule.
  if tg_op='UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null
       and row(new.case_number,new.session_date,new.session_time,new.plaintiffs,new.defendants,new.case_type,new.stage,new.claim_summary,new.previous_date,new.previous_minutes,new.status)
           is not distinct from
           row(old.case_number,old.session_date,old.session_time,old.plaintiffs,old.defendants,old.case_type,old.stage,old.claim_summary,old.previous_date,old.previous_minutes,old.status) then
      return new;
    end if;
  end if;

  if new.session_date is null or new.session_time is null or new.stage is null
     or exists (
       select from unnest(array[new.case_number,new.plaintiffs,new.defendants,new.case_type,new.claim_summary]) field(value)
       where not coalesce(field.value ~ '[^[:space:]  　﻿]',false)
     ) then
    raise exception 'case_required_fields' using errcode='23514';
  end if;
  if new.stage='followup' and (
    new.previous_date is null or not coalesce(new.previous_minutes ~ '[^[:space:]  　﻿]',false)
  ) then
    raise exception 'case_previous_session_required' using errcode='23514';
  end if;
  return new;
end;
$$;

create trigger case_input_completeness
before insert or update on public.cases
for each row execute function private.require_complete_case();
