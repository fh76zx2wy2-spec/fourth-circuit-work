-- المهمة الموجهة لأكثر من شخص: «يكفي تنفيذ أحدهم» تُغلق عند الباقين تلقائيًا.
-- رسالة التنفيذ إلزامية للموظف، وإعادة المهمة تتطلب سببًا يصل للموظف.
alter table public.tasks add column if not exists completion_mode text not null default 'all'
  check (completion_mode in ('all','any'));
alter table public.task_assignments add column if not exists execution_note text;
alter table public.task_assignments add column if not exists return_reason text;
alter table private.task_assignment_events add column if not exists note text;

create or replace function public.save_directed_task(p_task jsonb)
returns void language plpgsql security definer set search_path to ''
as $function$
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
 insert into public.tasks(id,created_by,title,category,case_number,details,proposed_action,due_date,priority,assigned_to,completion_mode)
 values(incoming.id,actor,incoming.title,incoming.category,incoming.case_number,incoming.details,
  incoming.proposed_action,incoming.due_date,incoming.priority,incoming.assigned_to,coalesce(incoming.completion_mode,'all'))
 on conflict(id) do nothing;
 if found then return; end if;
 select * into existing from public.tasks where id=incoming.id;
 if existing.created_by is distinct from actor or existing.deleted_at is not null then
  raise exception 'task_forbidden' using errcode='42501';
 end if;
 if row(existing.title,existing.category,existing.case_number,existing.details,existing.proposed_action,
        existing.due_date,existing.priority,existing.assigned_to,existing.completion_mode)
    is distinct from
    row(incoming.title,incoming.category,incoming.case_number,incoming.details,incoming.proposed_action,
        incoming.due_date,incoming.priority,incoming.assigned_to,coalesce(incoming.completion_mode,'all')) then
  raise exception 'task_already_saved' using errcode='22023';
 end if;
end $function$;

create or replace function public.change_task_assignment(p_task uuid, p_assignee uuid, p_action text, p_note text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare a public.task_assignments; actor uuid:=auth.uid(); judge boolean:=private.is_judge();
 target uuid; title text; mode text; event text; msg text; note text:=nullif(btrim(coalesce(p_note,'')),'');
 other record;
begin
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 select t.title,t.completion_mode into title,mode from public.tasks t where t.id=p_task and t.deleted_at is null;
 if not found then raise exception 'Task unavailable'; end if;
 select * into a from public.task_assignments where task_id=p_task and assignee_id=p_assignee for update;
 if not found or not (judge or actor=p_assignee) then raise exception 'Forbidden' using errcode='42501'; end if;
 if note is not null and char_length(note)>1000 then raise exception 'الرسالة طويلة جدًا'; end if;
 if p_action='execute' and actor=p_assignee and a.executed_at is null and a.confirmed_at is null then
   if not judge and (note is null or char_length(note)<3) then
     raise exception 'اكتب رسالة التنفيذ قبل الإرسال.' using errcode='23514';
   end if;
   update public.task_assignments set executed_at=now(),confirmed_at=case when judge then now() end,execution_note=note
   where task_id=p_task and assignee_id=p_assignee;
   if not judge then
     select id into target from public.profiles where private.is_submission_recipient(id);
     event:='executed'; msg:=format('نفّذ %s المهمة: %s%s',a.assignee_name,title,case when note is not null then ' — «'||note||'»' else '' end);
   end if;
   -- «يكفي تنفيذ أحدهم»: تُغلق عند الباقين الذين لم ينفذوها، ويصلهم إشعار.
   if mode='any' then
     for other in delete from public.task_assignments
       where task_id=p_task and assignee_id<>p_assignee and executed_at is null returning assignee_id loop
       insert into public.notifications(recipient_id,actor_id,kind,message)
       values(other.assignee_id,actor,'updated',left(format('نفّذ %s المهمة «%s»، فأُغلقت عندك.',a.assignee_name,title),450));
     end loop;
   end if;
 elsif judge and p_action='confirm' and a.executed_at is not null and a.confirmed_at is null then
   update public.task_assignments set confirmed_at=now() where task_id=p_task and assignee_id=p_assignee;
 elsif judge and p_action='return' and a.executed_at is not null and a.confirmed_at is null then
   if note is null or char_length(note)<3 then
     raise exception 'اكتب سبب الإعادة.' using errcode='23514';
   end if;
   update public.task_assignments set executed_at=null,confirmed_at=null,attempt=attempt+1,return_reason=note
   where task_id=p_task and assignee_id=p_assignee;
   target:=p_assignee;event:='returned';msg:=format('أُعيدت إليك المهمة: %s — السبب: %s',title,note);
 else
   return;
 end if;
 insert into private.task_assignment_events(task_id,assignee_id,attempt,action,actor_id,note)
 values(p_task,p_assignee,a.attempt,p_action,actor,note);
 if judge and p_action='execute' then
   insert into private.task_assignment_events(task_id,assignee_id,attempt,action,actor_id)
   values(p_task,p_assignee,a.attempt,'confirm',actor);
 end if;
 if target is not null then
   insert into public.notifications(recipient_id,actor_id,task_id,kind,message)
   values(target,actor,p_task,'task_'||event,left(msg,450));
   perform private.push_directed_task(p_task,target,event||':'||p_assignee::text,a.attempt);
 end if;
end $function$;
revoke all on function public.change_task_assignment(uuid,uuid,text,text) from public, anon;
grant execute on function public.change_task_assignment(uuid,uuid,text,text) to authenticated;

-- النسخة القديمة (صفحات لم تُحدَّث): بلا رسالة، فيُطلب من الموظف تحديث الصفحة.
create or replace function public.change_task_assignment(p_task uuid, p_assignee uuid, p_action text)
returns void language sql security definer set search_path to ''
as $$ select public.change_task_assignment(p_task,p_assignee,p_action,null) $$;
