begin;
alter table public.tasks add column assigned_to uuid[];
create table public.task_assignments (
 task_id uuid not null references public.tasks(id),
 assignee_id uuid not null references public.profiles(id),
 assignee_name text not null,
 assigned_at timestamptz not null default now(),
 executed_at timestamptz,
 confirmed_at timestamptz,
 attempt integer not null default 0,
 primary key(task_id,assignee_id)
);
create table private.task_assignment_events (
 task_id uuid not null,
 assignee_id uuid not null,
 attempt integer not null,
 action text not null check (action in ('execute','confirm','return')),
 actor_id uuid not null references public.profiles(id),
 occurred_at timestamptz not null default now(),
 primary key (task_id,assignee_id,attempt,action),
 foreign key (task_id,assignee_id) references public.task_assignments(task_id,assignee_id)
);
alter table private.task_assignment_events enable row level security;
revoke all on private.task_assignment_events from public,anon,authenticated;
create index on public.task_assignments(assignee_id,task_id);
alter table public.task_assignments enable row level security;
revoke all on public.task_assignments from public,anon,authenticated;
grant select on public.task_assignments to authenticated;
create policy assignment_read on public.task_assignments for select to authenticated
 using ((select private.is_active_user()) and (assignee_id=(select auth.uid()) or (select private.is_judge())));
insert into public.task_assignments(task_id,assignee_id,assignee_name,assigned_at,executed_at,confirmed_at)
select t.id,p.id,p.display_name,t.created_at,t.completed_at,
 case when t.status='done' then coalesce(t.completed_at,t.updated_at) end
from public.tasks t cross join public.profiles p
where private.is_submission_recipient(p.id);

alter policy task_read on public.tasks using ((select private.is_active_user()) and
 ((select private.is_judge()) or exists(select from public.task_assignments a where a.task_id=tasks.id and a.assignee_id=(select auth.uid()))));
alter policy task_update on public.tasks using ((select private.is_active_user()) and
 ((select private.is_judge()) or created_by=(select auth.uid())))
 with check ((select private.is_active_user()) and ((select private.is_judge()) or created_by=(select auth.uid())));
alter policy task_revisions_read on public.task_revisions using
 ((select private.is_judge()) or exists(select from public.tasks t where t.id=task_revisions.task_id));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
 check (kind in ('created','updated','approved','removed','submitted','task_created','task_executed','task_returned'));
alter table private.judge_push_delivery drop constraint judge_push_delivery_task_sender_check;
alter table private.judge_push_delivery add column recipient_id uuid references public.profiles(id),
 add column task_event text not null default 'assigned',
 add column task_attempt integer not null default 0;
update private.judge_push_delivery d set recipient_id=s.recipient_id
from private.judge_push_subscriptions s where s.endpoint=d.endpoint;
alter table private.judge_push_delivery alter column recipient_id set not null;
drop index private.judge_push_delivery_task_endpoint_idx;
create unique index judge_push_delivery_task_endpoint_idx on private.judge_push_delivery(task_id,endpoint,recipient_id,task_event,task_attempt)
 where task_id is not null;

create or replace function public.register_judge_push(subscription jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare destination text := subscription->>'endpoint';
begin
 if not private.is_active_user() then raise exception 'push_forbidden' using errcode='42501'; end if;
 if destination is null or length(destination)>2048 or destination !~ '^https://([a-z0-9-]+[.])*push[.]apple[.]com/'
     and destination !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com)/'
     or not coalesce(subscription->'keys'->>'p256dh' ~ '^[A-Za-z0-9_-]{87}$',false)
     or not coalesce(subscription->'keys'->>'auth' ~ '^[A-Za-z0-9_-]{22}$',false) then
   raise exception 'invalid_push_subscription' using errcode='22023';
 end if;
 insert into private.judge_push_subscriptions(endpoint,recipient_id,subscription)
 values(destination,auth.uid(),subscription)
 on conflict(endpoint) do update set recipient_id=excluded.recipient_id,subscription=excluded.subscription;
end $$;

create function private.push_directed_task(task uuid, recipient uuid, event text, cycle int)
returns void language plpgsql set search_path='' as $$
begin
 insert into private.judge_push_delivery(task_id,task_sender,endpoint,recipient_id,task_event,task_attempt)
 select task,event,endpoint,recipient,event,cycle from private.judge_push_subscriptions
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
   values(target,new.created_by,new.id,'task_created',format('لديك مهمة جديدة من %s، اضغط للاطلاع عليها',sender_name));
   perform private.push_directed_task(new.id,target,'assigned',0);
 end loop;
 return new;
end $$;

create function public.change_task_assignment(p_task uuid,p_assignee uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.task_assignments; actor uuid:=auth.uid(); judge boolean:=private.is_judge();
 target uuid; title text; event text; msg text;
begin
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 select t.title into title from public.tasks t where t.id=p_task and t.deleted_at is null;
 if not found then raise exception 'Task unavailable'; end if;
 select * into a from public.task_assignments where task_id=p_task and assignee_id=p_assignee for update;
 if not found or not (judge or actor=p_assignee) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_action='execute' and actor=p_assignee and a.executed_at is null and a.confirmed_at is null then
   update public.task_assignments set executed_at=now(),confirmed_at=case when judge then now() end
   where task_id=p_task and assignee_id=p_assignee;
   if not judge then
     select id into target from public.profiles where private.is_submission_recipient(id);
     event:='executed'; msg:=format('نفّذ %s المهمة: %s',a.assignee_name,title);
   end if;
 elsif judge and p_action='confirm' and a.executed_at is not null and a.confirmed_at is null then
   update public.task_assignments set confirmed_at=now() where task_id=p_task and assignee_id=p_assignee;
 elsif judge and p_action='return' and a.executed_at is not null and a.confirmed_at is null then
   update public.task_assignments set executed_at=null,confirmed_at=null,attempt=attempt+1 where task_id=p_task and assignee_id=p_assignee;
   target:=p_assignee;event:='returned';msg:=format('أُعيدت إليك المهمة: %s',title);
 else
   return;
 end if;
 insert into private.task_assignment_events(task_id,assignee_id,attempt,action,actor_id)
 values(p_task,p_assignee,a.attempt,p_action,actor);
 if judge and p_action='execute' then
   insert into private.task_assignment_events(task_id,assignee_id,attempt,action,actor_id)
   values(p_task,p_assignee,a.attempt,'confirm',actor);
 end if;
 if target is not null then
   insert into public.notifications(recipient_id,actor_id,task_id,kind,message)
   values(target,actor,p_task,'task_'||event,left(msg,450));
   -- An execution by each assignee has its own event key.
   perform private.push_directed_task(p_task,target,event||':'||p_assignee::text,a.attempt);
 end if;
end $$;
revoke all on function public.change_task_assignment(uuid,uuid,text) from public,anon;
grant execute on function public.change_task_assignment(uuid,uuid,text) to authenticated;

create function public.read_circuit_notifications(p_id uuid default null,p_task uuid default null,p_submission uuid default null)
returns void language sql set search_path='' as $$
 update public.notifications set read_at=now()
 where recipient_id=(select auth.uid()) and read_at is null
 and (p_id is null and p_task is null and p_submission is null or id=p_id or task_id=p_task or submission_id=p_submission)
$$;
revoke all on function public.read_circuit_notifications(uuid,uuid,uuid) from public,anon;
grant execute on function public.read_circuit_notifications(uuid,uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.log_revision_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  event_kind text;
  actor uuid := new.updated_by;
  actor_name text;
  sender boolean := private.is_submission_sender(new.updated_by);
begin
  if tg_op = 'UPDATE' then
    if sender and private.case_contents(new) = private.case_contents(old)
       and old.status = 'draft' and new.status = 'ready' then return new; end if;
    insert into public.case_revisions(case_id,changed_by,old_record)
    values(old.id,(select auth.uid()),to_jsonb(old));
  end if;

  if new.deleted_at is not null then
    delete from private.pending_case_submissions where case_id = new.id;
  elsif sender and (tg_op = 'INSERT' or private.case_contents(new) is distinct from private.case_contents(old)) then
    insert into private.pending_case_submissions(case_id,actor_id) values(new.id,actor)
    on conflict(case_id) do update set actor_id = excluded.actor_id;
  end if;

  select display_name into actor_name from public.profiles where id=actor;
  if tg_op='INSERT' then event_kind:='created';
  elsif new.deleted_at is not null and old.deleted_at is null then event_kind:='removed';
  elsif new.status='approved' and old.status is distinct from new.status then event_kind:='approved';
  else event_kind:='updated'; end if;
  insert into public.notifications(recipient_id,actor_id,case_id,kind,message)
  select id,actor,new.id,event_kind,
    coalesce(actor_name,'أحد الموظفين') ||
    case event_kind when 'created' then ' أضاف القضية ' when 'approved' then ' اعتمد القضية '
      when 'removed' then ' أزال القضية ' else ' حدّث القضية ' end || new.case_number
  from public.profiles where private.is_submission_recipient(id)
    and (not sender or event_kind = 'removed');
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.queue_case_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into private.judge_push_delivery(submission_id,endpoint,recipient_id)
  select new.id,endpoint,recipient_id from private.judge_push_subscriptions
  where private.is_submission_recipient(recipient_id);
  if found then perform private.kick_case_push(); end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_case_push(dispatch_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb;
begin
  if dispatch_token is null or dispatch_token is distinct from
    (select decrypted_secret from vault.decrypted_secrets where name='case_push_dispatch_token')
  then raise exception 'dispatch_forbidden' using errcode = '42501'; end if;

  with due as (
    select d.delivery_id from private.judge_push_delivery d
    join private.judge_push_subscriptions s using(endpoint)
    where d.sent_at is null and d.attempts<6 and d.next_attempt<=now()
      and d.recipient_id=s.recipient_id
      and exists(select 1 from public.profiles p where p.id=d.recipient_id and p.is_active)
      and (d.task_id is not null or private.is_submission_recipient(d.recipient_id))
    order by d.next_attempt limit 20 for update of d skip locked
  ), claimed as (
    update private.judge_push_delivery d
    set attempts=d.attempts+1,next_attempt=now()+interval '1 minute'*(d.attempts+1)
    from due where d.delivery_id=due.delivery_id
    returning d.*
  )
  select jsonb_build_object(
    'vapid', (select decrypted_secret::jsonb from vault.decrypted_secrets where name='case_push_vapid'),
    'jobs', coalesce(jsonb_agg(jsonb_build_object('deliveryId',c.delivery_id,'id',c.submission_id,
      'taskId',c.task_id,'sender',c.task_sender,'attempt',c.attempts,'subscription',s.subscription)), '[]'::jsonb)
  ) into payload from claimed c join private.judge_push_subscriptions s on s.endpoint=c.endpoint and s.recipient_id=c.recipient_id;
  return payload;
end $function$
;

alter policy notifications_read on public.notifications using (
 recipient_id=(select auth.uid()) and (select private.is_active_user())
 and (case_id is null or (select private.is_judge()))
);
alter publication supabase_realtime add table public.task_assignments;
commit;
