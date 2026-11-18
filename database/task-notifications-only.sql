begin;

-- Keep case submission and revision records while suppressing their notifications.
create function private.skip_case_notification() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.case_id is not null or new.submission_id is not null or new.kind='submitted' then
    return null;
  end if;
  return new;
end;
$$;

create trigger skip_case_notification
before insert on public.notifications
for each row execute function private.skip_case_notification();

alter policy notifications_read on public.notifications using (
  recipient_id=(select auth.uid()) and (select private.is_active_user())
  and case_id is null and submission_id is null and kind<>'submitted'
);

alter table public.case_submissions disable trigger queue_case_push;
delete from private.judge_push_delivery
where submission_id is not null and sent_at is null;

commit;
