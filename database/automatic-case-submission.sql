alter table public.case_submissions add column request_fingerprint text;

create function public.save_and_submit_cases(request_id uuid, records jsonb, edit_existing boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  sender text;
  item jsonb;
  incoming public.cases;
  stored public.cases;
  prior public.case_submissions;
  ids uuid[] := '{}';
  submitted_ids uuid[] := '{}';
  day date;
  case_id_to_send uuid;
  added integer := 0;
  edited integer := 0;
  notice text;
begin
  if not private.is_submission_sender(actor) then
    raise exception 'submission_forbidden' using errcode = '42501';
  end if;
  if request_id is null or edit_existing is null or jsonb_typeof(records) is distinct from 'array'
     or jsonb_array_length(records) = 0 or (edit_existing and jsonb_array_length(records) <> 1) then
    raise exception 'invalid_submission' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  select * into prior from public.case_submissions where id = request_id;
  if found then
    if prior.actor_id <> actor then raise exception 'submission_forbidden' using errcode = '42501'; end if;
    if prior.request_fingerprint is distinct from md5(jsonb_build_array(edit_existing,records)::text) then
      raise exception 'case_submission_already_saved' using errcode = '22023';
    end if;
    return prior.id;
  end if;

  for item in select value from jsonb_array_elements(records) order by value->>'id' loop
    incoming := jsonb_populate_record(null::public.cases, item);
    if incoming.id is null or incoming.id = any(ids) or incoming.session_date is null
       or (day is not null and incoming.session_date <> day) then
      raise exception 'invalid_submission' using errcode = '22023';
    end if;
    day := incoming.session_date;
    ids := array_append(ids, incoming.id);
    select * into stored from public.cases where id = incoming.id for update;
    if edit_existing then
      if not found or stored.deleted_at is not null then raise exception 'case_not_found'; end if;
      if row(stored.case_number,stored.session_date,stored.session_time,stored.plaintiffs,stored.defendants,stored.case_type,stored.claim_summary,stored.stage,stored.session_number,stored.previous_date,stored.previous_minutes)
         is distinct from row(incoming.case_number,incoming.session_date,incoming.session_time,incoming.plaintiffs,incoming.defendants,incoming.case_type,incoming.claim_summary,incoming.stage,incoming.session_number,incoming.previous_date,incoming.previous_minutes)
         or (coalesce((item->>'clear_previous')::boolean,false) and
           concat(stored.last_session_summary,stored.adjournment_reason,stored.reason_evidence_quote,stored.next_action,stored.summary_warning) <> '') then
        update public.cases set
          case_number = incoming.case_number,
          session_date = incoming.session_date,
          session_time = incoming.session_time,
          plaintiffs = incoming.plaintiffs,
          defendants = incoming.defendants,
          case_type = incoming.case_type,
          claim_summary = incoming.claim_summary,
          stage = incoming.stage,
          session_number = incoming.session_number,
          previous_date = incoming.previous_date,
          previous_minutes = incoming.previous_minutes,
          last_session_summary = case when coalesce((item->>'clear_previous')::boolean,false) then '' else stored.last_session_summary end,
          adjournment_reason = case when coalesce((item->>'clear_previous')::boolean,false) then '' else stored.adjournment_reason end,
          reason_evidence_quote = case when coalesce((item->>'clear_previous')::boolean,false) then '' else stored.reason_evidence_quote end,
          next_action = case when coalesce((item->>'clear_previous')::boolean,false) then '' else stored.next_action end,
          summary_warning = case when coalesce((item->>'clear_previous')::boolean,false) then '' else stored.summary_warning end,
          status = 'draft', updated_by = actor
        where id = incoming.id;
      end if;
    elsif found then
      if stored.created_by <> actor or stored.deleted_at is not null or stored.session_date <> day then
        raise exception 'invalid_submission' using errcode = '22023';
      end if;
    else
      insert into public.cases(id, case_number, session_date, session_time, plaintiffs, defendants, case_type, claim_summary, stage, session_number, previous_date, previous_minutes, created_by, updated_by, status)
      values(incoming.id, incoming.case_number, incoming.session_date, incoming.session_time, incoming.plaintiffs, incoming.defendants, incoming.case_type, incoming.claim_summary, incoming.stage, incoming.session_number, incoming.previous_date, incoming.previous_minutes, actor, actor, 'draft');
    end if;
  end loop;

  foreach case_id_to_send in array ids loop
    delete from private.pending_case_submissions where case_id = case_id_to_send and actor_id = actor;
    if not found then continue; end if;
    if edit_existing then edited := edited + 1; else added := added + 1; end if;
    submitted_ids := array_append(submitted_ids, case_id_to_send);
    update public.cases set status = 'ready' where id = case_id_to_send and status = 'draft';
  end loop;
  if cardinality(submitted_ids) = 0 then return null; end if;

  select display_name into sender from public.profiles where id = actor;
  insert into public.case_submissions(id, actor_id, actor_name, session_date, added_count, edited_count, case_ids, request_fingerprint)
  values(request_id, actor, sender, day, added, edited, submitted_ids, md5(jsonb_build_array(edit_existing,records)::text));
  notice := case when edit_existing then format('%s عدّل قضية محفوظة', sender)
    else format('%s أرسل قضايا جديدة للمراجعة (العدد: %s)', sender, added) end;
  insert into public.notifications(recipient_id, actor_id, kind, message, submission_id)
  select id, actor, 'submitted', notice, request_id from public.profiles where private.is_submission_recipient(id);
  return request_id;
end $$;

revoke all on function public.save_and_submit_cases(uuid,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.save_and_submit_cases(uuid,jsonb,boolean) to authenticated;
