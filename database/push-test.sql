alter table private.judge_push_subscriptions add column last_test_at timestamptz;

create function public.prepare_judge_push_test(requester uuid) returns jsonb
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
    returning s.recipient_id,s.subscription,s.endpoint
  )
  select coalesce(jsonb_agg(jsonb_build_object('device',platform.label,'subscription',e.subscription) order by platform.label,e.endpoint),'[]'::jsonb)
    into jobs
  from eligible e
  cross join lateral (
    select coalesce((
      select case
        when a.user_agent ~* 'iPhone' then 'الآيفون'
        when a.user_agent ~* 'iPad' then 'الآيباد'
        when a.user_agent ~* 'Macintosh|Mac OS X' then 'الماك'
        when a.user_agent ~* 'Android' then 'أندرويد'
        when a.user_agent ~* 'Windows' then 'ويندوز'
        else 'جهاز مسجل'
      end from auth.sessions a
      where a.user_id=e.recipient_id and a.user_agent is not null
      order by coalesce(a.refreshed_at,a.created_at) desc limit 1
    ),'جهاز مسجل') as label
  ) platform;

  return jsonb_build_object(
    'vapid',(select decrypted_secret::jsonb from vault.decrypted_secrets where name='case_push_vapid'),
    'jobs',jobs
  );
end $$;

revoke all on function public.prepare_judge_push_test(uuid) from public,anon,authenticated;
grant execute on function public.prepare_judge_push_test(uuid) to service_role;
