create function private.reject_anonymous_account() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.is_anonymous then raise exception 'anonymous_sign_in_disabled' using errcode='42501'; end if;
  return new;
end $$;
create trigger reject_anonymous_account before insert on auth.users
for each row execute function private.reject_anonymous_account();

create function private.push_device_label(agent text) returns text
language sql immutable set search_path='' as $$
  select case
    when agent ~* 'iPhone' then 'الآيفون'
    when agent ~* 'iPad' then 'الآيباد'
    when agent ~* 'Macintosh|Mac OS X' then 'الماك'
    when agent ~* 'Android' then 'أندرويد'
    when agent ~* 'Windows' then 'ويندوز'
    else 'جهاز مسجل'
  end
$$;

alter table private.judge_push_subscriptions add column device_label text;
update private.judge_push_subscriptions s
set device_label=private.push_device_label((
  select a.user_agent from auth.sessions a where a.user_id=s.recipient_id and a.user_agent is not null
  order by coalesce(a.refreshed_at,a.created_at) desc limit 1
));
create function private.label_push_subscription() returns trigger
language plpgsql set search_path='' as $$
declare label text := private.push_device_label(nullif(current_setting('request.headers',true),'')::jsonb->>'user-agent');
begin
  if label <> 'جهاز مسجل' or new.device_label is null then new.device_label := label; end if;
  return new;
end $$;
create trigger label_push_subscription before insert or update of subscription on private.judge_push_subscriptions
for each row execute function private.label_push_subscription();

do $$
begin
  if (select count(*) from private.account_logins a join public.profiles p on p.id=a.user_id where p.is_active)<>3 then
    raise exception 'three_login_accounts_required';
  end if;
end $$;

update private.judge_push_subscriptions s set recipient_id=m.account_id
from private.account_notification_owners m where s.recipient_id=m.former_recipient;

update public.profiles p set is_active=false
where p.is_active and not exists(select from private.account_logins a where a.user_id=p.id);
create or replace function public.prepare_judge_push_test(requester uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  jobs jsonb;
begin
  if not private.is_submission_recipient(requester) then
    raise exception 'push_test_forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('judge_web_push_test'));
  if exists (
    select from private.judge_push_subscriptions s
    where private.is_submission_recipient(s.recipient_id)
      and s.last_test_at > now() - interval '15 seconds'
  ) then raise exception 'push_test_rate_limit' using errcode = 'P0001'; end if;

  with eligible as (
    update private.judge_push_subscriptions s set last_test_at=now()
    where private.is_submission_recipient(s.recipient_id)
    returning s.subscription,s.endpoint,s.device_label
  )
  select coalesce(jsonb_agg(jsonb_build_object('device',coalesce(e.device_label,'جهاز مسجل'),'subscription',e.subscription) order by coalesce(e.device_label,'جهاز مسجل'),e.endpoint),'[]'::jsonb)
    into jobs
  from eligible e;

  return jsonb_build_object(
    'vapid',(select decrypted_secret::jsonb from vault.decrypted_secrets where name='case_push_vapid'),
    'jobs',jobs
  );
end $$;
