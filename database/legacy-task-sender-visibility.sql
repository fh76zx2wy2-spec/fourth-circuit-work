begin;

-- Yahya's historical task retained the author ID from his former device login.
-- Recognize that verified identity only for task visibility.
create function private.is_original_task_sender(original_author uuid) returns boolean
language sql stable set search_path='' as $$
  select original_author=(select auth.uid()) or (
    original_author='fa7c8d86-db45-4e5a-89fa-0ffb5dfc80fe'::uuid and
    (select auth.uid())='0c27e0e2-3c1f-4d90-a7f3-07d9f58f9c9e'::uuid
  )
$$;
revoke all on function private.is_original_task_sender(uuid) from public,anon,authenticated;
grant execute on function private.is_original_task_sender(uuid) to authenticated;

create or replace function private.is_task_participant(target_task uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select from public.tasks where id=target_task and private.is_original_task_sender(created_by)
  ) or exists (
    select from public.task_assignments where task_id=target_task and assignee_id=(select auth.uid())
  )
$$;

alter policy task_read on public.tasks using (
 (select private.is_active_user()) and (
  private.is_original_task_sender(created_by) or (select private.is_judge()) or
  exists(select from public.task_assignments a where a.task_id=tasks.id and a.assignee_id=(select auth.uid()))
 )
);

create function public.sent_by_me(task public.tasks) returns boolean
language sql stable set search_path='' as $$
  select private.is_original_task_sender(task.created_by)
$$;
revoke all on function public.sent_by_me(public.tasks) from public,anon,authenticated;
grant execute on function public.sent_by_me(public.tasks) to authenticated;

commit;
