begin;
create table if not exists private.hearings_device_links (
  main_device_id uuid primary key,
  hearings_user_id uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now()
);

alter table private.hearings_device_links enable row level security;
revoke all on private.hearings_device_links from public, anon, authenticated;

create or replace function public.get_hearings_identity(device_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select hearings_user_id
  from private.hearings_device_links
  where main_device_id = device_id;
$$;

revoke all on function public.get_hearings_identity(uuid) from public, anon, authenticated;
grant execute on function public.get_hearings_identity(uuid) to service_role;
commit;
