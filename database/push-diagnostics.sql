create function public.check_judge_push_subscription(browser_subscription jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_submission_recipient(auth.uid()) and exists (
    select from private.judge_push_subscriptions
    where recipient_id=auth.uid()
      and endpoint=browser_subscription->>'endpoint'
      and subscription->'keys'=browser_subscription->'keys'
  )
$$;

revoke all on function public.check_judge_push_subscription(jsonb) from public,anon,authenticated;
grant execute on function public.check_judge_push_subscription(jsonb) to authenticated;
