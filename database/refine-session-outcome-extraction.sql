create or replace function private.extract_session_outcome(minutes text)
returns table(outcome text, is_result boolean)
language plpgsql immutable set search_path = '' as $$
declare
  source text := regexp_replace(minutes, '«[^»]*»|"[^"]*"', ' ', 'g');
  clause text;
  phrase text;
  candidate text;
  terminal boolean;
  source_purpose text;
  parts text[];
begin
  foreach clause in array regexp_split_to_array(source, '[.؛;؟\n]+|[، ]+(?=(?:(?:ثم|وعليه|لذلك|لذا)(?:\s+فقد)?\s+)?(?:[وف]قررت\s+الدائرة|وحكمت\s+الدائرة|قررت\s+الدائرة|(?:و?عليه|لذلك|لذا)\s+(?:فقد\s+)?[وف]?(?:قررت|رفعت|أجلت)))')
  loop
    phrase := translate(regexp_replace(btrim(clause), '[ًٌٍَُِّْـ]', '', 'g'), 'أإآٱ', 'اااا');
    if phrase ~ '^(?:(?:و?لذلك|وعليه|وبناء عليه|ثم|لذا|فقد)\s+)*(?:[وف]?حكمت\s+الدائرة|[وف]?قررت\s+(?:الدائرة|رفع\s+الجلسة|تاجيل\s+الجلسة)|[وف]?رفعت\s+(?:الدائرة\s+)?(?:الجلسة|ل)|و?[أا]جلت\s+(?:الدائرة\s+)?الجلسة|شطبت\s+الدعوى|صدر\s+الحكم)' then
      candidate := null;
      terminal := false;
      if phrase ~ '^(?:(?:و?لذلك|وعليه|وبناء عليه|ثم|لذا|فقد)\s+)*(?:[وف]?حكمت\s+الدائرة|صدر\s+الحكم)(?:\s|$)' then
        candidate := 'صدر الحكم'; terminal := true;
      elsif phrase ~ '^(?:(?:و?لذلك|وعليه|وبناء عليه|ثم|لذا|فقد)\s+)*(?:شطبت\s+الدعوى|[وف]?قررت\s+الدائرة\s+شطب\s+الدعوى)(?:\s|$)' then
        candidate := 'شطبت الدعوى'; terminal := true;
      elsif phrase ~ '[وف]?قررت\s+الدائرة\s+وقف\s+السير\s+في\s+الدعوى' then
        candidate := 'قررت الدائرة وقف السير في الدعوى'; terminal := true;
      elsif phrase ~ '[وف]?قررت\s+(?:الدائرة\s+)?(?:رفع\s+الجلسة|تاجيل\s+الجلسة|ندب\s+خبير)|رفعت\s|اجلت\s' then
        parts := array_remove(array[
          case when phrase ~ '(?:للدراسة|لدراسة\s+الدعوى)' then 'للدراسة' end,
          case when phrase ~ '(?:لندب|قررت\s+الدائرة\s+ندب)\s+خبير' then 'لندب خبير' end,
          case when phrase ~ '(?:لايداع|لتقديم)\s+(?:المدعي\s+)?مذكرة' then 'لإيداع مذكرة' end,
          case when phrase ~ '(?:لامهال|لتمكين).{0,60}(?:للجواب|للرد|لتقديم\s+(?:الجواب|جوابه))' and phrase !~ 'للرد\s+على\s+(?:مذكرة|المذكرة)' then 'لتقديم الجواب' end,
          case when phrase ~ 'لاستكمال\s+التبليغ|لتبليغ\s+(?:المدعى عليه|الاطراف)' then 'لاستكمال التبليغ' end,
          case when phrase ~ 'للتامل|للمداولة' then 'للمداولة' end,
          case when phrase ~ '(?:لاحضار|لتقديم|لايداع)\s+(?:المستندات|الوثائق)' then 'لإحضار المستندات' end,
          case when phrase ~ 'للاطلاع\s+على\s+تقرير\s+الخبير' then 'للاطلاع على تقرير الخبير' end,
          case when phrase ~ '(?:لورود|لانتظار|لحين\s+ورود)\s+(?:افادة|رد)\s+(?:الجهة|جهة)' then 'لورود إفادة جهة مختصة' end,
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
          source_purpose := regexp_replace(btrim(clause),
            '(?:[،:]?\s+(?:و?حددت|وتحديد|على أن (?:تكون|تعقد)|فيما حددت|موعد الجلسة|الجلسة القادمة|في الجلسة القادمة)\s+).*$', '');
          source_purpose := split_part(source_purpose, '،', 1);
          candidate := substring(btrim(source_purpose) from '(?:رفعت\s+(?:الدائرة\s+)?(?:الجلسة\s+)?|[أا]جلت\s+(?:الدائرة\s+)?الجلسة\s+|قررت\s+(?:الدائرة\s+)?(?:رفع|ت[أا]جيل)\s+الجلسة\s+)(ل[^،:]{3,95})[،:]?$');
          if translate(candidate,'أإآ','ااا') ~ '^(?:للاسبوع|ليوم|لتاريخ|لجلسة|لحين\s+موعد|لساعة|لانتهاء\s+الوقت|لما\s+(?:ذكر|سبق)|للاسباب\s+المذكورة)' then candidate := null; end if;
          if candidate is not null then candidate := 'رفعت ' || candidate; end if;
        end if;
      else
        continue;
      end if;
      if phrase ~ '(?:لم\s+ترفع|لم\s+تحكم|في\s+الجلسة\s+السابقة|سبق\s+ان|بحسب\s+ما\s+ذكر|على\s+سبيل\s+المثال)' then continue; end if;
      if candidate is null and phrase ~ '^[وف]?رفعت\s+الجلسة(?:\s+(?:الى|وحددت).*)?$' then continue; end if;
      outcome := case when char_length(candidate) <= 180 then candidate end;
      is_result := terminal;
    end if;
  end loop;
  if outcome is not null then return next; end if;
end;
$$;

-- Reprocess historical source minutes without overwriting manual outcomes.
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
