create or replace function private.require_task_proposed_action() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select from public.profiles where id=new.created_by and role='secretary')
     and (
       exists(select from unnest(new.assigned_to) as recipient(id) where private.is_submission_recipient(recipient.id))
       or (tg_op='UPDATE' and new.assigned_to is null and exists (
         select from public.task_assignments a where a.task_id=new.id and private.is_submission_recipient(a.assignee_id)
       ))
     ) then
    if not coalesce(new.proposed_action ~ '[^[:space:]  　﻿]', false) then
      raise exception 'أدخل الإجراء المقترح للمهمة الموجهة إلى القاضي.' using errcode = '23514';
    end if;
  elsif tg_op='INSERT' then
    new.proposed_action := null;
  else
    new.proposed_action := old.proposed_action;
  end if;
  return new;
end;
$$;
