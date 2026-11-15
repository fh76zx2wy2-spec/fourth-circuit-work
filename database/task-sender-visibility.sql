begin;

-- This lookup avoids making the task and assignment policies depend on each other.
create function private.is_task_participant(target_task uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select from public.tasks where id=target_task and created_by=(select auth.uid())
  ) or exists (
    select from public.task_assignments where task_id=target_task and assignee_id=(select auth.uid())
  )
$$;
revoke all on function private.is_task_participant(uuid) from public,anon,authenticated;
grant execute on function private.is_task_participant(uuid) to authenticated;

alter policy assignment_read on public.task_assignments using (
 (select private.is_active_user()) and (
  (select private.is_judge()) or private.is_task_participant(task_id)
 )
);

alter policy task_read on public.tasks using (
 (select private.is_active_user()) and (
  created_by=(select auth.uid()) or (select private.is_judge()) or
  exists(select from public.task_assignments a where a.task_id=tasks.id and a.assignee_id=(select auth.uid()))
 )
);

commit;
