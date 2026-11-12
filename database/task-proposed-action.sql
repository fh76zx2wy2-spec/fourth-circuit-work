alter table public.tasks add column proposed_action text;

create function private.require_task_proposed_action() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not coalesce(new.proposed_action ~ '[^[:space:]  　﻿]', false) then
    raise exception 'أدخل الإجراء المقترح للمهمة.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Existing tasks can still be completed or removed without editing their content.
create trigger require_task_proposed_action
before insert or update of title, category, case_number, details, due_date, priority, proposed_action
on public.tasks for each row execute function private.require_task_proposed_action();
