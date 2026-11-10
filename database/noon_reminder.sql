-- OPTIONAL: activate an in-app notification at 12:00 noon, Arabia Standard Time.
-- Run AFTER setup.sql in the NEW Supabase project and after enabling Supabase Cron.
-- This is an in-app notice, not an SMS/email/closed-app push notification.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in ('created','updated','approved','removed','daily'));
alter table public.notifications add column if not exists report_date date;
create unique index if not exists one_noon_notice_per_day on public.notifications(recipient_id,kind,report_date) where kind='daily';

create or replace function private.queue_noon_reports() returns void language plpgsql security definer set search_path = '' as $$
declare d date; n integer;
begin
 d:=(now() at time zone 'Asia/Riyadh')::date + 1;
 while extract(dow from d) in (5,6) loop d:=d+1; end loop;
 select count(*) into n from public.cases where session_date=d and deleted_at is null;
 insert into public.notifications (recipient_id,actor_id,case_id,kind,message,report_date)
 select id,null,null,'daily','تقرير جلسات '||d::text||' جاهز للمراجعة: '||n::text||' قضية حسب آخر حصر.',d
 from public.profiles where is_active=true and role='judge'
 on conflict do nothing;
end;
$$;
revoke all on function private.queue_noon_reports() from public,anon,authenticated;

-- Enable pg_cron in Supabase Dashboard → Integrations → Cron first.
-- pg_cron uses UTC; 09:00 UTC = 12:00 noon in Saudi Arabia.
-- Sunday through Thursday only; Thursday's report refers to Sunday.
select cron.schedule('judicial-daily-noon','0 9 * * 0-4',$$select private.queue_noon_reports();$$);
