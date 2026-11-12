create or replace function private.guard_case_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare content_changed boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    content_changed := private.case_contents(new) is distinct from private.case_contents(old);
  end if;
  if tg_op = 'INSERT' or new.session_time is distinct from old.session_time then
    if new.session_time < time '08:00' or new.session_time > time '14:00'
       or extract(epoch from new.session_time)::numeric % 300 <> 0 then
      raise exception 'case_working_hours' using errcode = '23514';
    end if;
  end if;
  if (content_changed or (tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved'))
     and new.deleted_at is null and new.stage = 'followup' and new.session_number is null then
    raise exception 'case_session_number_required' using errcode = '23514';
  end if;
  if private.is_submission_sender(auth.uid()) and new.deleted_at is null and (
    content_changed or exists(select from private.pending_case_submissions where case_id = new.id)
  ) then
    new.status := 'draft';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'approved'
     and new.session_number is distinct from old.session_number then
    new.status := 'ready';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  -- A judge's explicit approval also closes a stale manual-submission entry.
  if tg_op = 'UPDATE' and private.is_submission_recipient(auth.uid())
     and new.status = 'approved' and new.deleted_at is null then
    delete from private.pending_case_submissions where case_id = new.id;
  end if;
  return new;
end $$;

-- Move complete legacy drafts to the review queue without replaying old notifications.
do $$
declare
  pending record;
  original_actor text := current_setting('request.jwt.claim.sub', true);
  reconciled integer := 0;
begin
  for pending in
    select p.case_id, p.actor_id
    from private.pending_case_submissions p
    join public.cases c on c.id = p.case_id
    where c.deleted_at is null and c.status = 'draft'
      and c.updated_by = p.actor_id and private.is_submission_sender(p.actor_id)
      and (c.stage <> 'followup' or c.session_number is not null)
    order by c.id for update of c
  loop
    begin
      perform set_config('request.jwt.claim.sub', pending.actor_id::text, true);
      delete from private.pending_case_submissions
      where case_id = pending.case_id and actor_id = pending.actor_id;
      if found then
        update public.cases set status = 'ready'
        where id = pending.case_id and status = 'draft';
        if found then reconciled := reconciled + 1; end if;
      end if;
    exception when check_violation then
      -- Leave incomplete historical records intact for correction.
      null;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', coalesce(original_actor,''), true);
  raise notice 'Legacy cases moved to review: %', reconciled;
end $$;
