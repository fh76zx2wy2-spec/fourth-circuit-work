create or replace function private.push_directed_task(task uuid, recipient uuid, event text, cycle int)
returns void language plpgsql set search_path='' as $$
declare push_label text := event;
begin
 if event='assigned' then
   select 'assigned:' || case p.display_name
     when 'زياد محمد البابطين' then 'ziyad'
     when 'يحيى محمد إبراهيم بكري' then 'yahya'
     when 'عبد الرحمن يحيى علي الشريف' then 'abdulrahman'
     else 'unknown'
   end || ':' || t.category into push_label
   from public.tasks t left join public.profiles p on p.id=t.created_by
   where t.id=task;
 end if;
 insert into private.judge_push_delivery(task_id,task_sender,endpoint,recipient_id,task_event,task_attempt)
 select task,coalesce(push_label,event),endpoint,recipient,event,cycle from private.judge_push_subscriptions
 where recipient_id=recipient on conflict do nothing;
 if found then perform private.kick_case_push(); end if;
end $$;

create or replace function private.notify_task_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 target uuid;
 sender_name text;
begin
 if tg_op='UPDATE' then
   if new.assigned_to is distinct from old.assigned_to
      or new.status is distinct from old.status or new.deleted_at is distinct from old.deleted_at then
     raise exception 'Use task assignment workflow' using errcode='42501';
   end if;
   insert into public.task_revisions(task_id,changed_by,old_record) values(old.id,auth.uid(),to_jsonb(old));
   return new;
 end if;
 if new.status <> 'open' or new.deleted_at is not null then raise exception 'Invalid new task'; end if;
 if coalesce(cardinality(new.assigned_to),0) not between 1 and 3 then raise exception 'اختر من توجه إليه المهمة.' using errcode='23514'; end if;
 select display_name into sender_name from public.profiles where id=new.created_by;
 for target in select distinct unnest(new.assigned_to) loop
   insert into public.task_assignments(task_id,assignee_id,assignee_name)
   select new.id,id,display_name from public.profiles where id=target and is_active and role in ('judge','secretary');
   if not found then raise exception 'Invalid task recipient' using errcode='23514'; end if;
   insert into public.notifications(recipient_id,actor_id,task_id,kind,message)
   values(target,new.created_by,new.id,'task_created',left(format('مهمة جديدة من %s: %s',sender_name,new.title),450));
   perform private.push_directed_task(new.id,target,'assigned',0);
 end loop;
 return new;
end $$;

