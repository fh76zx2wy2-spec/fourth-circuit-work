alter table public.notifications add column task_id uuid references public.tasks(id) on delete cascade;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('created','updated','approved','removed','submitted','task_created'));
create unique index notifications_new_task_recipient_idx
  on public.notifications(task_id,recipient_id) where kind='task_created';

alter table private.judge_push_delivery
  add column delivery_id uuid not null default gen_random_uuid(),
  add column task_id uuid references public.tasks(id) on delete cascade,
  add column task_sender text check (task_sender in ('يحيى','عبد الرحمن')),
  drop constraint judge_push_delivery_pkey,
  alter column submission_id drop not null,
  add primary key (delivery_id),
  add check (
    (submission_id is not null and task_id is null and task_sender is null)
    or (submission_id is null and task_id is not null and task_sender is not null)
  );
create unique index judge_push_delivery_submission_endpoint_idx
  on private.judge_push_delivery(submission_id,endpoint) where submission_id is not null;
create unique index judge_push_delivery_task_endpoint_idx
  on private.judge_push_delivery(task_id,endpoint) where task_id is not null;

create or replace function private.notify_task_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor_name text;
  sender_name text;
  ev text;
begin
  select display_name into actor_name from public.profiles where id=new.updated_by;
  if private.is_submission_sender(new.updated_by) then
    sender_name := case when actor_name like 'يحيى %' then 'يحيى' else 'عبد الرحمن' end;
  end if;

  if tg_op='INSERT' and sender_name is not null then
    if new.deleted_at is not null then return new; end if;
    insert into public.notifications(recipient_id,actor_id,task_id,kind,message)
    select id,new.updated_by,new.id,'task_created',format('لديك مهمة جديدة من %s، اضغط للاطلاع عليها',sender_name)
    from public.profiles where private.is_submission_recipient(id)
    on conflict do nothing;

    insert into private.judge_push_delivery(task_id,task_sender,endpoint)
    select new.id,sender_name,endpoint from private.judge_push_subscriptions
    where private.is_submission_recipient(recipient_id)
    on conflict do nothing;
    if found then perform private.kick_case_push(); end if;
    return new;
  end if;

  if tg_op='UPDATE' then
    insert into public.task_revisions(task_id,changed_by,old_record) values(old.id,auth.uid(),to_jsonb(old));
    if sender_name is not null and new.deleted_at is not distinct from old.deleted_at
       and new.status is not distinct from old.status then return new; end if;
  end if;
  ev := case when tg_op='INSERT' then 'أضاف مهمة' when new.deleted_at is not null and old.deleted_at is null then 'أزال مهمة' when new.status='done' and old.status is distinct from new.status then 'أنجز مهمة' when new.status='open' and old.status='done' then 'أعاد فتح مهمة' else 'عدّل مهمة' end;
  insert into public.notifications(recipient_id,actor_id,case_id,kind,message)
  select id,new.updated_by,null,'updated',left(coalesce(actor_name,'أحد الموظفين')||' '||ev||': '||new.title,450)
  from public.profiles where is_active and id is distinct from new.updated_by;
  return new;
end $$;

create or replace function public.claim_case_push(dispatch_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare payload jsonb;
begin
  if dispatch_token is null or dispatch_token is distinct from
    (select decrypted_secret from vault.decrypted_secrets where name='case_push_dispatch_token')
  then raise exception 'dispatch_forbidden' using errcode = '42501'; end if;

  with due as (
    select d.delivery_id from private.judge_push_delivery d
    join private.judge_push_subscriptions s using(endpoint)
    where d.sent_at is null and d.attempts<6 and d.next_attempt<=now()
      and private.is_submission_recipient(s.recipient_id)
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
  ) into payload from claimed c join private.judge_push_subscriptions s using(endpoint);
  return payload;
end $$;

create or replace function public.finish_case_push(batch uuid, destination text, attempt integer, result text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if result='sent' then
    update private.judge_push_delivery set sent_at=now()
    where (delivery_id=batch or submission_id=batch) and endpoint=destination and attempts=attempt;
  elsif result='expired' then
    delete from private.judge_push_subscriptions
    where endpoint=destination and exists(select from private.judge_push_delivery
      where (delivery_id=batch or submission_id=batch) and endpoint=destination and attempts=attempt);
  end if;
end $$;
