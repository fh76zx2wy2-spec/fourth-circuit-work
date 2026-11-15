-- Any active user may verify only their own subscription.
create or replace function public.check_judge_push_subscription(browser_subscription jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select from private.judge_push_subscriptions
    where recipient_id=(select auth.uid())
      and endpoint=browser_subscription->>'endpoint'
      and subscription->'keys'=browser_subscription->'keys'
  )
$$;
