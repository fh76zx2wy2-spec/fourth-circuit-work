-- ملف القضية الزمني تلقائيًا: إضافة «أرشيف أحكام تقاضي» ترسل الجلسات السابقة لكل قضية من قضايا المنظم.
-- كل عنصر: {case_number, sessions:[{hijri:"dd/mm/yyyy", minutes}]}.
-- الجلسة المحفوظة لا تتكرر ولا يُستبدل ضبطها؛ يُكمَّل الضبط فقط إذا كان فارغًا.
-- لا تُقبل إلا قضايا موجودة في المنظم، ولا يكتب إلا القاضي وأمينا السر المفعّلون.
create or replace function public.import_case_history(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  me uuid := (select auth.uid());
  it jsonb; se jsonb; cn text; h text; mins text;
  added int:=0; filled int:=0; same int:=0; skipped int:=0; n int;
begin
  if not exists(select 1 from public.profiles where id=me and is_active and role in ('judge','secretary')) then
    raise exception 'غير مصرح' using errcode='42501';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>80 then raise exception 'bad payload'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    cn := btrim(coalesce(it->>'case_number',''));
    if cn !~ '^\d{9,10}$' or jsonb_typeof(it->'sessions')<>'array' or jsonb_array_length(it->'sessions')>80
       or not exists(select 1 from public.cases where case_number=cn and deleted_at is null) then
      skipped:=skipped+1; continue;
    end if;
    for se in select * from jsonb_array_elements(it->'sessions') loop
      h := btrim(coalesce(se->>'hijri',''));
      mins := left(coalesce(se->>'minutes',''),60000);
      if h !~ '^\d{2}/\d{2}/\d{4}$' then skipped:=skipped+1; continue; end if;
      insert into public.case_session_history(case_number,session_hijri,minutes)
      values(cn,h,mins) on conflict(case_number,session_hijri) do nothing;
      get diagnostics n = row_count;
      if n>0 then added:=added+1;
      else
        update public.case_session_history set minutes=mins, fetched_at=now()
        where case_number=cn and session_hijri=h and minutes='' and mins<>'';
        get diagnostics n = row_count;
        if n>0 then filled:=filled+1; else same:=same+1; end if;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('added',added,'filled',filled,'unchanged',same,'skipped',skipped);
end $function$;
revoke all on function public.import_case_history(jsonb) from public, anon;
grant execute on function public.import_case_history(jsonb) to authenticated;
