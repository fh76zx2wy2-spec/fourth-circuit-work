alter table public.session_outcomes add column evidence text
  check (evidence is null or char_length(evidence) between 1 and 420);

create function private.infer_session_outcome(minutes text)
returns table(outcome text, is_result boolean, evidence text)
language plpgsql immutable set search_path = '' as $$
declare
  clause text;
  clean text;
  previous_clause text;
  previous_clean text;
  basis text;
  candidate text;
  explicit_outcome record;
  purposes text[];
begin
  foreach clause in array regexp_split_to_array(
    regexp_replace(minutes,'«[^»]*»|"[^"]*"',' ' || chr(10) || ' ','g'),
    '[.؛;؟!\n]+|[،[:space:]]+(?=(?:وعليه|لذلك|لذا|فقررت|وقررت|وحكمت)\s+)')
  loop
    clause := btrim(clause);
    clean := translate(regexp_replace(clause,'[ًٌٍَُِّْـ]','','g'),'أإآٱ','اااا');
    basis := null;
    if clean !~ '(?:في الجلسة السابقة|سبق ان|على سبيل المثال)' then
      select * into explicit_outcome from private.extract_session_outcome(clause);
      if found then
        outcome := explicit_outcome.outcome;
        is_result := explicit_outcome.is_result;
        evidence := left(clause,420);
      elsif clean ~ '^(?:(?:وعليه|لذلك|لذا|ثم|فقد)\s+)*(?:[وف]?قررت الدائرة|[وف]?(?:امهلت|كلفت|طلبت|وجهت|خاطبت|ندبت|حجزت|اقفلت) الدائرة|الدائرة (?:امهلت|كلفت|طلبت|وجهت|خاطبت|ندبت|حجزت))\s+' then
        if clean !~ '^(?:.*الدائرة\s+)(?:رفض|رفضت|عدم|لم|بحث امكانية|النظر في طلب)' then
          basis := clean;
        end if;
      elsif clean ~ '^(?:(?:وعليه|لذلك|لذا|ثم)\s+)*(?:[وف]?اجابت الدائرة|[وف]?وافقت الدائرة|[وف]?استجابت الدائرة)\s+(?:الطرف|المدعي|المدعى عليه|الوكيل|على طلبه|لطلبه)' and
            previous_clean ~ '^(?:[وف]?طلب|[وف]?استمهل)\s+(?:المدعي|المدعى عليه|الوكيل|احد الطرفين)' then
        basis := previous_clean;
      end if;
      if basis is not null then
        candidate := null;
        if basis ~ '(?:حجزت الدائرة الدعوى|قررت الدائرة حجز الدعوى)\s+للحكم' then
          outcome := 'حُجزت الدعوى للحكم'; is_result := true; evidence := left(clause,420);
        elsif basis ~ '(?:اقفلت الدائرة|قررت الدائرة قفل)\s+باب المرافعة' then
          outcome := 'أُقفل باب المرافعة'; is_result := true; evidence := left(clause,420);
        elsif not coalesce(is_result,false) then
          purposes := array_remove(array[
            case when basis ~ '(?:للدراسة|للمداولة|لدراسة الدعوى)' then 'للدراسة' end,
            case when basis ~ '(?:تقديم|ايداع|ليقدم|بتقديم|بايداع)\s+(?:المدعي\s+|المدعى عليه\s+)?مذكرة' then 'لتقديم مذكرة' end,
            case when basis ~ '(?:للرد|بالرد|للجواب|بالاجابة|لتقديم الجواب|للاجابة)' then 'لتقديم الرد' end,
            case when basis ~ '(?:تقديم|احضار|ايداع|ليحضر|بتقديم|باحضار|استكمال)\s+(?:ما لديه من\s+)?(?:البينة|بينة|البينات|المستندات|مستنداته|مستندات|الوثائق)' then 'لتقديم البينة أو المستندات' end,
            case when basis ~ '(?:ندبت الدائرة|ندب)\s+خبير' then 'لندب خبير' end,
            case when basis ~ '(?:انتظار|ورود|ايداع|تقديم)\s+تقرير\s+(?:الخبير|خبير)' then 'لانتظار تقرير الخبير' end,
            case when basis ~ '(?:مخاطبة|خاطبت الدائرة|الكتابة الى|ورود افادة|انتظار افادة|ورود رد)\s+' then 'لورود إفادة جهة' end,
            case when basis ~ '(?:سماع|لسماع|بسماع|احضار|باحضار)\s+(?:الشهود|شهود|شهادة)' then 'لسماع الشهود' end,
            case when basis ~ '(?:اداء|باداء|توجيه|بتوجيه)\s+اليمين' then 'لأداء اليمين' end,
            case when basis ~ '(?:التبليغ|تبليغ|بتبليغ|ابلاغ)\s*(?:المدعى عليه|الاطراف|الخصم|$)' then 'لاستكمال التبليغ' end
          ], null);
          if cardinality(purposes)>0 and outcome is null then
            candidate := 'رفعت ' || array_to_string(purposes,' و');
          end if;
          if candidate is not null and char_length(candidate)<=180 then
            outcome := candidate;
            is_result := false;
            evidence := case when basis = previous_clean
              then substring(minutes from strpos(minutes,previous_clause) for least(420, strpos(minutes,clause) - strpos(minutes,previous_clause) + char_length(clause)))
              else left(clause,420) end;
          end if;
        end if;
      end if;
    end if;
    previous_clause := clause;
    previous_clean := clean;
  end loop;
  if outcome is not null then
    if nullif(evidence,'') is not null and strpos(minutes,evidence)>0 then return next; end if;
  end if;
end;
$$;

create or replace function private.record_session_outcome(c public.cases) returns void
language sql set search_path = '' as $$
  insert into public.session_outcomes as stored
    (case_key, hearing_date, outcome, is_result, source_case_id, source_session_date, evidence)
  select private.session_case_key(c.case_number), c.previous_date, x.outcome,
         coalesce(x.is_result,false), c.id, c.session_date, x.evidence
  from (select 1) base left join lateral private.infer_session_outcome(c.previous_minutes) x on true
  where c.deleted_at is null and c.stage = 'followup' and c.previous_date < c.session_date
    and btrim(c.previous_minutes) <> ''
  on conflict (case_key, hearing_date) do update
    set outcome = case when stored.is_manual then stored.outcome else excluded.outcome end,
        is_result = case when stored.is_manual then stored.is_result else excluded.is_result end,
        evidence = excluded.evidence,
        source_case_id = excluded.source_case_id, source_session_date = excluded.source_session_date
    where stored.source_case_id = excluded.source_case_id
       or (excluded.source_session_date, excluded.source_case_id) <
          (stored.source_session_date, stored.source_case_id);
$$;

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
