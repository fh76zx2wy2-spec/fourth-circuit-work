create table public.session_outcomes (
  case_key text not null,
  hearing_date date not null,
  outcome text,
  is_result boolean not null default false,
  is_manual boolean not null default false,
  source_case_id uuid not null,
  source_session_date date not null,
  primary key (case_key, hearing_date),
  check (outcome is null or char_length(outcome) between 1 and 180)
);

alter table public.session_outcomes enable row level security;
revoke all on public.session_outcomes from public, anon, authenticated;
grant select on public.session_outcomes to authenticated;
create policy session_outcomes_read on public.session_outcomes for select to authenticated
  using ((select private.is_active_user()));

create function private.session_case_key(value text) returns text
language sql immutable set search_path = '' as $$
  select translate(btrim(value), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
$$;

-- Only explicit dispositions and purposes linked to a court decision qualify.
create function private.extract_session_outcome(minutes text)
returns table(outcome text, is_result boolean)
language plpgsql immutable set search_path = '' as $$
declare
  source text := regexp_replace(minutes, '«[^»]*»|"[^"]*"', ' ', 'g');
  clause text;
  phrase text;
  candidate text;
  terminal boolean;
  parts text[];
begin
  foreach clause in array regexp_split_to_array(source, '[.؛;؟\n]+|\s+(?=ثم\s+(?:قررت|رفعت|حكمت)|(?:و?قررت|وحكمت)\s+الدائرة)')
  loop
    phrase := translate(regexp_replace(btrim(clause), '[ًٌٍَُِّْـ]', '', 'g'), 'أإآٱ', 'اااا');
    if phrase ~ '^(?:(?:و?لذلك|وعليه|وبناء عليه|ثم)\s+)*(?:(?:و?قررت|و?حكمت)\s+الدائرة|و?رفعت\s+(?:الدائرة\s+)?(?:الجلسة|ل)|و?[أا]جلت\s+(?:الدائرة\s+)?الجلسة|شطبت\s+الدعوى|صدر\s+الحكم)' then
      candidate := null;
      terminal := false;
      if phrase ~ '^(?:(?:و?لذلك|وعليه|وبناء عليه|ثم)\s+)*(?:و?حكمت\s+الدائرة|صدر\s+الحكم)(?:\s|$)' then
        candidate := 'صدر الحكم'; terminal := true;
      elsif phrase ~ '^(?:(?:و?لذلك|وعليه|وبناء عليه|ثم)\s+)*(?:شطبت\s+الدعوى|و?قررت\s+الدائرة\s+شطب\s+الدعوى)(?:\s|$)' then
        candidate := 'شطبت الدعوى'; terminal := true;
      elsif phrase ~ 'و?قررت\s+الدائرة\s+وقف\s+السير\s+في\s+الدعوى' then
        candidate := 'قررت الدائرة وقف السير في الدعوى'; terminal := true;
      elsif phrase ~ 'و?قررت\s+الدائرة\s+(?:رفع\s+الجلسة|تاجيل\s+الجلسة|ندب\s+خبير)|رفعت\s|اجلت\s' then
        parts := array_remove(array[
          case when phrase ~ '(?:للدراسة|لدراسة\s+الدعوى)' then 'للدراسة' end,
          case when phrase ~ '(?:لندب|قررت\s+الدائرة\s+ندب)\s+خبير' then 'لندب خبير' end,
          case when phrase ~ '(?:لايداع|لتقديم)\s+(?:المدعي\s+)?مذكرة' then 'لإيداع مذكرة' end,
          case when phrase ~ '(?:لاحضار|لتقديم|لايداع)\s+(?:المستندات|الوثائق)' then 'لإحضار المستندات' end,
          case when phrase ~ 'للاطلاع\s+على\s+تقرير\s+الخبير' then 'للاطلاع على تقرير الخبير' end,
          case when phrase ~ '(?:لورود|لانتظار)\s+(?:افادة|رد)\s+(?:الجهة|جهة)' then 'لورود إفادة جهة مختصة' end,
          case when phrase ~ 'للرد\s+على\s+(?:مذكرة|المذكرة)' then 'للرد على مذكرة' end,
          case when phrase ~ 'للنطق\s+بالحكم' then 'للنطق بالحكم' end,
          case when phrase ~ 'لسماع\s+(?:الشهود|شهادة)' then 'لسماع الشهود' end,
          case when phrase ~ 'لاداء\s+اليمين' then 'لأداء اليمين' end,
          case when phrase ~ 'لاستكمال\s+البينة' then 'لاستكمال البينة' end,
          case when phrase ~ 'لاجراء\s+الصلح' then 'لإجراء الصلح' end
        ], null);
        if cardinality(parts) > 0 then
          candidate := 'رفعت ' || array_to_string(parts, ' و');
        else
          -- Keep an unfamiliar explicit purpose only if the source itself is brief.
          candidate := substring(btrim(clause) from '(?:رفعت\s+(?:الدائرة\s+)?(?:الجلسة\s+)?|[أا]جلت\s+(?:الدائرة\s+)?الجلسة\s+|قررت\s+الدائرة\s+(?:رفع|ت[أا]جيل)\s+الجلسة\s+)(ل[^،:]{3,95})$');
          if translate(candidate,'أإآ','ااا') ~ '^(?:للاسبوع|ليوم|لتاريخ|لجلسة|لحين\s+موعد)' then candidate := null; end if;
          if candidate is not null then candidate := 'رفعت ' || candidate; end if;
        end if;
      else
        continue;
      end if;
      if phrase ~ '(?:لم\s+ترفع|لم\s+تحكم|في\s+الجلسة\s+السابقة|سبق\s+ان|على\s+سبيل\s+المثال)' then continue; end if;
      if candidate is null and phrase ~ '^(?:ثم\s+)?و?رفعت\s+الجلسة$' then continue; end if;
      outcome := case when char_length(candidate) <= 180 then candidate end;
      is_result := terminal;
    end if;
  end loop;
  if outcome is not null then return next; end if;
end;
$$;

create function private.record_session_outcome(c public.cases) returns void
language sql set search_path = '' as $$
  insert into public.session_outcomes as stored
    (case_key, hearing_date, outcome, is_result, source_case_id, source_session_date)
  select private.session_case_key(c.case_number), c.previous_date, x.outcome,
         coalesce(x.is_result,false), c.id, c.session_date
  from (select 1) base left join lateral private.extract_session_outcome(c.previous_minutes) x on true
  where c.deleted_at is null and c.stage = 'followup' and c.previous_date < c.session_date
    and btrim(c.previous_minutes) <> ''
  on conflict (case_key, hearing_date) do update
    set outcome = excluded.outcome, is_result = excluded.is_result,
        source_case_id = excluded.source_case_id, source_session_date = excluded.source_session_date
    where not stored.is_manual and
      (stored.source_case_id = excluded.source_case_id
       or (excluded.source_session_date, excluded.source_case_id) <
          (stored.source_session_date, stored.source_case_id));
$$;

create function private.sync_session_outcome() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_session_outcome(new);
  return new;
end;
$$;

create trigger sync_session_outcome
after insert or update of previous_minutes, previous_date, case_number, session_date, stage on public.cases
for each row execute function private.sync_session_outcome();

create function public.set_session_outcome(p_case_id uuid, p_outcome text, p_is_result boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.cases;
begin
  if not coalesce(private.is_active_user(),false) then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into c from public.cases where id = p_case_id and deleted_at is null for share;
  if not found or c.stage <> 'followup' or c.previous_date is null
    or c.previous_date >= c.session_date or btrim(c.previous_minutes) = '' then
    raise exception 'no linked previous hearing' using errcode = '22023';
  end if;
  insert into public.session_outcomes (case_key, hearing_date, outcome, is_result, is_manual, source_case_id, source_session_date)
  values (private.session_case_key(c.case_number), c.previous_date, nullif(btrim(p_outcome), ''), coalesce(p_is_result,false), true, c.id, c.session_date)
  on conflict (case_key, hearing_date) do update
    set outcome = excluded.outcome, is_result = excluded.is_result, is_manual = true;
end;
$$;
revoke all on function public.set_session_outcome(uuid,text,boolean) from public, anon;
grant execute on function public.set_session_outcome(uuid,text,boolean) to authenticated;

do $$
declare c public.cases;
begin
  for c in select * from public.cases where deleted_at is null and stage = 'followup'
    and previous_date < session_date and btrim(previous_minutes) <> ''
  loop
    perform private.record_session_outcome(c);
  end loop;
end;
$$;
