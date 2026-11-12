create table private.hearings_account_links (
  main_account_id uuid primary key,
  hearings_user_id uuid not null unique references public.profiles(user_id)
);
alter table private.hearings_account_links enable row level security;
revoke all on private.hearings_account_links from public,anon,authenticated;

create function public.get_hearings_account(account_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select hearings_user_id from private.hearings_account_links where main_account_id=account_id
$$;
revoke all on function public.get_hearings_account(uuid) from public,anon,authenticated;
grant execute on function public.get_hearings_account(uuid) to service_role;
