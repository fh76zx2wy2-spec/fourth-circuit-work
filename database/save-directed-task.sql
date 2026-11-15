create function public.save_directed_task(p_task jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
 actor uuid := auth.uid();
 incoming public.tasks;
 existing public.tasks;
begin
 if not private.is_active_user() then
  raise exception 'task_forbidden' using errcode='42501';
 end if;
 incoming := jsonb_populate_record(null::public.tasks,p_task);
 if incoming.id is null then raise exception 'missing_task_id' using errcode='22023'; end if;

 -- Insert without requiring the sender to be able to read the recipient's task.
 insert into public.tasks(id,created_by,title,category,case_number,details,proposed_action,due_date,priority,assigned_to)
 values(incoming.id,actor,incoming.title,incoming.category,incoming.case_number,incoming.details,
  incoming.proposed_action,incoming.due_date,incoming.priority,incoming.assigned_to)
 on conflict(id) do nothing;
 if found then return; end if;

 select * into existing from public.tasks where id=incoming.id;
 if existing.created_by is distinct from actor or existing.deleted_at is not null then
  raise exception 'task_forbidden' using errcode='42501';
 end if;
 if row(existing.title,existing.category,existing.case_number,existing.details,existing.proposed_action,
        existing.due_date,existing.priority,existing.assigned_to)
    is distinct from
    row(incoming.title,incoming.category,incoming.case_number,incoming.details,incoming.proposed_action,
        incoming.due_date,incoming.priority,incoming.assigned_to) then
  raise exception 'task_already_saved' using errcode='22023';
 end if;
end $$;
revoke all on function public.save_directed_task(jsonb) from public,anon,authenticated;
grant execute on function public.save_directed_task(jsonb) to authenticated;
