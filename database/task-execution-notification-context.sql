create or replace function private.push_directed_task(task uuid, recipient uuid, event text, cycle int)
returns void language plpgsql set search_path='' as $$
declare push_label text := event;
begin
 if event='assigned' or event like 'executed:%' then
   select split_part(event,':',1) || ':' || case p.display_name
     when 'زياد محمد البابطين' then 'ziyad'
     when 'يحيى محمد إبراهيم بكري' then 'yahya'
     when 'عبد الرحمن يحيى علي الشريف' then 'abdulrahman'
     else 'unknown'
   end || ':' || t.category into push_label
   from public.tasks t left join public.profiles p on p.id=case when event='assigned' then t.created_by else split_part(event,':',2)::uuid end
   where t.id=task;
 end if;
 insert into private.judge_push_delivery(task_id,task_sender,endpoint,recipient_id,task_event,task_attempt)
 select task,coalesce(push_label,event),endpoint,recipient,event,cycle from private.judge_push_subscriptions
 where recipient_id=recipient on conflict do nothing;
 if found then perform private.kick_case_push(); end if;
end $$;
