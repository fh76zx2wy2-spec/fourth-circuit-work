create function public.delete_task_permanently(p_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_submission_recipient(auth.uid()) then
    raise exception 'task_delete_forbidden' using errcode = '42501';
  end if;

  perform 1 from public.tasks where id=p_task for update;
  if not found then return; end if;

  perform 1 from public.task_assignments where task_id=p_task order by assignee_id for update;
  delete from private.task_assignment_events where task_id=p_task;
  delete from public.task_assignments where task_id=p_task;
  delete from public.task_revisions where task_id=p_task;
  -- The task foreign keys also remove its notifications and pending push deliveries.
  delete from public.tasks where id=p_task;
end;
$$;
revoke all on function public.delete_task_permanently(uuid) from public,anon,authenticated;
grant execute on function public.delete_task_permanently(uuid) to authenticated;
