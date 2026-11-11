create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table private.judge_push_subscriptions (
  endpoint text primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  subscription jsonb not null
);

create table private.judge_push_delivery (
  submission_id uuid not null references public.case_submissions(id) on delete cascade,
  endpoint text not null references private.judge_push_subscriptions(endpoint) on delete cascade,
  attempts integer not null default 0,
  next_attempt timestamptz not null default now(),
  sent_at timestamptz,
  primary key(submission_id,endpoint)
);

create function public.register_judge_push(subscription jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare destination text := subscription->>'endpoint';
begin
  if not private.is_submission_recipient(auth.uid()) then raise exception 'push_forbidden' using errcode = '42501'; end if;
  if destination is null or length(destination)>2048 or destination !~ '^https://([a-z0-9-]+[.])*push[.]apple[.]com/'
     and destination !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com)/'
     or not coalesce(subscription->'keys'->>'p256dh' ~ '^[A-Za-z0-9_-]{87}$',false)
     or not coalesce(subscription->'keys'->>'auth' ~ '^[A-Za-z0-9_-]{22}$',false) then
    raise exception 'invalid_push_subscription' using errcode = '22023';
  end if;
  insert into private.judge_push_subscriptions(endpoint,recipient_id,subscription)
  values(destination,auth.uid(),subscription)
  on conflict(endpoint) do update set recipient_id=excluded.recipient_id,subscription=excluded.subscription;
end $$;

create function public.unregister_judge_push(destination text) returns void
language sql security definer set search_path = '' as $$
  delete from private.judge_push_subscriptions where endpoint=destination and recipient_id=auth.uid()
$$;
revoke all on function public.register_judge_push(jsonb), public.unregister_judge_push(text) from public,anon,authenticated;
grant execute on function public.register_judge_push(jsonb), public.unregister_judge_push(text) to authenticated;

create function private.kick_case_push() returns void
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='case_push_url'),
    headers := jsonb_build_object('content-type','application/json','x-dispatch-token',
      (select decrypted_secret from vault.decrypted_secrets where name='case_push_dispatch_token'))
  )
  where exists(
    select from private.judge_push_delivery
    where sent_at is null and attempts<6 and next_attempt<=now()
  )
  and exists(select from vault.secrets where name='case_push_url')
  and exists(select from vault.secrets where name='case_push_dispatch_token')
$$;

create function private.queue_case_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.judge_push_delivery(submission_id,endpoint)
  select new.id,endpoint from private.judge_push_subscriptions
  where private.is_submission_recipient(recipient_id);
  if found then perform private.kick_case_push(); end if;
  return new;
end $$;
create trigger queue_case_push after insert on public.case_submissions
for each row execute function private.queue_case_push();

create function public.claim_case_push(dispatch_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare payload jsonb;
begin
  if dispatch_token is null or dispatch_token is distinct from
    (select decrypted_secret from vault.decrypted_secrets where name='case_push_dispatch_token')
  then raise exception 'dispatch_forbidden' using errcode = '42501'; end if;

  with due as (
    select d.submission_id,d.endpoint from private.judge_push_delivery d
    join private.judge_push_subscriptions s using(endpoint)
    where d.sent_at is null and d.attempts<6 and d.next_attempt<=now()
      and private.is_submission_recipient(s.recipient_id)
    order by d.next_attempt limit 20 for update of d skip locked
  ), claimed as (
    update private.judge_push_delivery d
    set attempts=d.attempts+1,next_attempt=now()+interval '1 minute'*(d.attempts+1)
    from due where d.submission_id=due.submission_id and d.endpoint=due.endpoint
    returning d.submission_id,d.endpoint,d.attempts
  )
  select jsonb_build_object(
    'vapid', (select decrypted_secret::jsonb from vault.decrypted_secrets where name='case_push_vapid'),
    'jobs', coalesce(jsonb_agg(jsonb_build_object('id',c.submission_id,'attempt',c.attempts,'subscription',s.subscription)), '[]'::jsonb)
  ) into payload from claimed c join private.judge_push_subscriptions s using(endpoint);
  return payload;
end $$;

create function public.finish_case_push(batch uuid, destination text, attempt integer, result text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if result='sent' then
    update private.judge_push_delivery set sent_at=now()
    where submission_id=batch and endpoint=destination and attempts=attempt;
  elsif result='expired' then
    delete from private.judge_push_subscriptions
    where endpoint=destination and exists(select from private.judge_push_delivery
      where submission_id=batch and endpoint=destination and attempts=attempt);
  end if;
end $$;
revoke all on function public.claim_case_push(text), public.finish_case_push(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_case_push(text), public.finish_case_push(uuid,text,integer,text) to service_role;

select cron.schedule('dispatch-case-submission-push','* * * * *','select private.kick_case_push()');
