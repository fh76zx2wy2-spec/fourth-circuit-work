create table private.account_logins (
  username text primary key check (username in ('abdulrahman','yahya','ziyad')),
  user_id uuid not null unique references public.profiles(id),
  attempted_at timestamptz[] not null default '{}'
);
revoke all on private.account_logins from public,anon,authenticated;

create function public.begin_account_login(p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  account private.account_logins;
  recent timestamptz[];
begin
  select a.* into account from private.account_logins a
  join public.profiles p on p.id=a.user_id where a.username=p_username and p.is_active
  for update of a;
  if not found then return null; end if;
  recent := array(select t from unnest(account.attempted_at) t where t > now()-interval '5 minutes');
  if cardinality(recent)>=5 then return jsonb_build_object('limited',true); end if;
  update private.account_logins set attempted_at=array_append(recent,now()) where username=p_username;
  return (select jsonb_build_object('email',u.email,'user_id',u.id,'pepper',
    (select decrypted_secret from vault.decrypted_secrets where name='account_login_pepper'))
    from auth.users u where u.id=account.user_id and not u.is_anonymous);
end $$;
revoke all on function public.begin_account_login(text) from public,anon,authenticated;
grant execute on function public.begin_account_login(text) to service_role;

create table private.account_notification_owners (
  former_recipient uuid primary key references public.profiles(id),
  account_id uuid not null references public.profiles(id)
);
create index account_notification_owners_account_idx on private.account_notification_owners(account_id);
revoke all on private.account_notification_owners from public,anon,authenticated;

create function private.owns_account_notification(recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select recipient=(select auth.uid()) or exists (
    select from private.account_notification_owners
    where former_recipient=recipient and account_id=(select auth.uid())
  )
$$;
revoke all on function private.owns_account_notification(uuid) from public,anon,authenticated;
grant execute on function private.owns_account_notification(uuid) to authenticated;
alter policy notifications_read on public.notifications
  using ((select private.is_active_user()) and private.owns_account_notification(recipient_id));
alter policy notifications_mark_read on public.notifications
  using ((select private.is_active_user()) and private.owns_account_notification(recipient_id))
  with check ((select private.is_active_user()) and private.owns_account_notification(recipient_id));
