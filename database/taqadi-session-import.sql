-- الإدخال الآلي لجلسات الدائرة من تقاضي + مراجعة جلسات اليوم وتأكيد المطابقة.
-- الإضافة («أرشيف أحكام تقاضي») تجمع الجلسات من جلسة تقاضي المفتوحة، وتسلمها لصفحة المنظم المسجّل دخولها،
-- والمنظم يستدعي import_taqadi_day باسم المستخدم الحالي. لا يتجاوز النظام نافذة أيام الإضافة المعتمدة في الموقع.

create table if not exists public.taqadi_day_snapshots (
  session_date date primary key,
  items jsonb not null default '[]'::jsonb,       -- [{case_number,time,status,missing:[...]}]
  fetched_at timestamptz not null default now(),
  fetched_by uuid references public.profiles(id)
);
alter table public.taqadi_day_snapshots enable row level security;
revoke all on public.taqadi_day_snapshots from public, anon, authenticated;
grant select on public.taqadi_day_snapshots to authenticated;
drop policy if exists taqadi_snapshots_read on public.taqadi_day_snapshots;
create policy taqadi_snapshots_read on public.taqadi_day_snapshots for select to authenticated
  using ((select private.is_active_user()));

create table if not exists public.session_reconciliations (
  session_date date primary key,
  confirmed_by uuid not null references public.profiles(id),
  confirmed_by_name text not null,
  confirmed_at timestamptz not null default now(),
  taqadi_count int not null,
  organizer_count int not null,
  snapshot_fetched_at timestamptz not null
);
alter table public.session_reconciliations enable row level security;
revoke all on public.session_reconciliations from public, anon, authenticated;
grant select on public.session_reconciliations to authenticated;
drop policy if exists reconciliations_read on public.session_reconciliations;
create policy reconciliations_read on public.session_reconciliations for select to authenticated
  using ((select private.is_active_user()));

-- نافذة أيام الإضافة كما في الموقع: أيام العمل الخمسة التالية لليوم (بتوقيت الرياض)، دون الجمعة والسبت.
create or replace function private.entry_window()
returns setof date language sql stable set search_path to ''
as $$
  select d::date from generate_series((now() at time zone 'Asia/Riyadh')::date + 1,
                                      (now() at time zone 'Asia/Riyadh')::date + 9, interval '1 day') d
  where extract(isodow from d) not in (5,6)
  order by d limit 5
$$;

-- لا إشعار لكل قضية أثناء الإدخال الآلي؛ يُرسل إشعار واحد للمراجعة بعد كل يوم.
create or replace function private.log_revision_notify()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  event_kind text;
  actor uuid := new.updated_by;
  actor_name text;
  sender boolean := private.is_submission_sender(new.updated_by);
begin
  if tg_op = 'UPDATE' then
    if sender and private.case_contents(new) = private.case_contents(old)
       and old.status = 'draft' and new.status = 'ready' then return new; end if;
    insert into public.case_revisions(case_id,changed_by,old_record)
    values(old.id,(select auth.uid()),to_jsonb(old));
  end if;

  if coalesce(current_setting('app.taqadi_import',true),'')='1' then return new; end if;

  if new.deleted_at is not null then
    delete from private.pending_case_submissions where case_id = new.id;
  elsif sender and (tg_op = 'INSERT' or private.case_contents(new) is distinct from private.case_contents(old)) then
    insert into private.pending_case_submissions(case_id,actor_id) values(new.id,actor)
    on conflict(case_id) do update set actor_id = excluded.actor_id;
  end if;

  select display_name into actor_name from public.profiles where id=actor;
  if tg_op='INSERT' then event_kind:='created';
  elsif new.deleted_at is not null and old.deleted_at is null then event_kind:='removed';
  elsif new.status='approved' and old.status is distinct from new.status then event_kind:='approved';
  else event_kind:='updated'; end if;
  insert into public.notifications(recipient_id,actor_id,case_id,kind,message)
  select id,actor,new.id,event_kind,
    coalesce(actor_name,'أحد الموظفين') ||
    case event_kind when 'created' then ' أضاف القضية ' when 'approved' then ' اعتمد القضية '
      when 'removed' then ' أزال القضية ' else ' حدّث القضية ' end || new.case_number
  from public.profiles where private.is_submission_recipient(id)
    and (not sender or event_kind = 'removed');
  return new;
end $function$;

-- إدخال يوم واحد. كل عنصر: case_number,time(HH:MM),plaintiffs,defendants,case_type,claim_summary,
-- stage(first|followup),session_number,previous_date(YYYY-MM-DD),previous_minutes.
-- القضية الموجودة في نفس التاريخ لا تُكرر ولا تُمس بياناتها، ولا وقتها؛ اختلاف الوقت يُسجّل للمراجعة فقط.
-- العنصر الناقص لا يُدخل، ويظهر في المراجعة.
create or replace function public.import_taqadi_day(p_date date, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  me uuid := (select auth.uid());
  me_name text;
  it jsonb; cn text; t time; te time; existing public.cases; status text; missing text[];
  out_items jsonb := '[]'::jsonb; added int:=0; updated int:=0; review int:=0; same int:=0; failed int:=0;
  prev jsonb;
begin
  select display_name into me_name from public.profiles where id=me and is_active and role in ('judge','secretary');
  if me_name is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  if p_date not in (select private.entry_window()) then
    raise exception 'التاريخ خارج أيام الإضافة المسموحة' using errcode='23514';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>80 then raise exception 'bad payload'; end if;

  perform set_config('app.taqadi_import','1',true);
  for it in select * from jsonb_array_elements(p_items) loop
    cn := nullif(btrim(it->>'case_number'),'');
    missing := array[]::text[];
    begin
      t := (it->>'time')::time;
    exception when others then t := null; end;
    begin
      te := nullif(it->>'end_time','')::time;
    exception when others then te := null; end;
    if cn is null or cn !~ '^\d{9,10}$' then status:='needs_review'; missing:=array['رقم القضية']; review:=review+1;
    else
      select * into existing from public.cases where case_number=cn and session_date=p_date and deleted_at is null limit 1;
      if found then
        -- وقت النهاية من تقاضي (لا يُدخَل يدويًا) يُحدَّث وحده دون بقية البيانات.
        if te is not null and existing.session_end_time is distinct from te then
          begin update public.cases set session_end_time=te where id=existing.id; exception when others then null; end;
        end if;
        -- لا يُغيّر وقت قضية موجودة آليًا: يُسجّل الاختلاف ويظهر في «مراجعة جلسات اليوم» ليقرره المراجع.
        if t is not null and existing.session_time is distinct from t then
          status:='time_differs'; missing:=array['الوقت مختلف عن تقاضي']; updated:=updated+1;
        else status:='unchanged'; same:=same+1; end if;
      else
        if t is null then missing:=array_append(missing,'الوقت'); end if;
        if coalesce(btrim(it->>'plaintiffs'),'')='' then missing:=array_append(missing,'المدعي'); end if;
        if coalesce(btrim(it->>'defendants'),'')='' then missing:=array_append(missing,'المدعى عليه'); end if;
        if coalesce(btrim(it->>'case_type'),'')='' then missing:=array_append(missing,'نوع الدعوى'); end if;
        if coalesce(btrim(it->>'claim_summary'),'')='' then missing:=array_append(missing,'موضوع الدعوى'); end if;
        if coalesce(it->>'stage','') not in ('first','followup') then missing:=array_append(missing,'نوع الجلسة'); end if;
        if (it->>'stage')='followup' then
          if coalesce(it->>'session_number','') !~ '^\d+$' then missing:=array_append(missing,'رقم الجلسة'); end if;
          if coalesce(it->>'previous_date','') !~ '^\d{4}-\d{2}-\d{2}$' then missing:=array_append(missing,'تاريخ الجلسة السابقة'); end if;
          if coalesce(btrim(it->>'previous_minutes'),'')='' then missing:=array_append(missing,'ضبط الجلسة السابقة'); end if;
        end if;
        if cardinality(missing)>0 then status:='needs_review'; review:=review+1;
        else
          begin
            insert into public.cases(case_number,session_date,session_time,plaintiffs,defendants,case_type,claim_summary,
              stage,session_number,previous_date,previous_minutes,created_by,updated_by,summary_mode,session_end_time)
            values(cn,p_date,t,btrim(it->>'plaintiffs'),btrim(it->>'defendants'),btrim(it->>'case_type'),btrim(it->>'claim_summary'),
              it->>'stage',case when it->>'stage'='followup' then (it->>'session_number')::smallint end,
              case when it->>'stage'='followup' then (it->>'previous_date')::date end,
              case when it->>'stage'='followup' then it->>'previous_minutes' else '' end,me,me,'automatic',te);
            status:='added'; added:=added+1;
          exception when others then status:='failed'; missing:=array[sqlerrm]; failed:=failed+1; end;
        end if;
      end if;
    end if;
    out_items := out_items || jsonb_build_object('case_number',coalesce(cn,it->>'case_number'),
      'time',to_char(t,'HH24:MI'),'status',status,'missing',to_jsonb(missing));
  end loop;
  perform set_config('app.taqadi_import','',true);

  select items into prev from public.taqadi_day_snapshots where session_date=p_date;
  insert into public.taqadi_day_snapshots(session_date,items,fetched_at,fetched_by)
  values(p_date,out_items,now(),me)
  on conflict(session_date) do update set items=excluded.items,fetched_at=now(),fetched_by=me;
  -- أي تغيير في قائمة تقاضي يُسقط تأكيد المطابقة السابق لذلك اليوم.
  if prev is distinct from null and (select jsonb_agg(jsonb_build_object('c',x->>'case_number','t',x->>'time') order by x->>'case_number') from jsonb_array_elements(prev) x)
     is distinct from (select jsonb_agg(jsonb_build_object('c',x->>'case_number','t',x->>'time') order by x->>'case_number') from jsonb_array_elements(out_items) x) then
    delete from public.session_reconciliations where session_date=p_date;
  end if;

  if added+updated+review+failed>0 then
    insert into public.notifications(recipient_id,actor_id,kind,message)
    select id,me,'updated',left(format('أُدخلت جلسات %s آليًا من تقاضي (%s جديدة، %s وقت مختلف%s). راجعها وأكد المطابقة.',
      to_char(p_date,'YYYY-MM-DD'),added,updated,case when review+failed>0 then format('، %s تحتاج مراجعة',review+failed) else '' end),450)
    from public.profiles where is_active and role in ('judge','secretary') and id<>me;
  end if;

  return jsonb_build_object('date',p_date,'added',added,'time_updated',0,'time_differs',updated,'unchanged',same,
    'needs_review',review,'failed',failed,'items',out_items);
end $function$;
revoke all on function public.import_taqadi_day(date,jsonb) from public, anon;
grant execute on function public.import_taqadi_day(date,jsonb) to authenticated;

-- أيام الإضافة المسموحة (للإضافة وصفحة المراجعة).
create or replace function public.taqadi_entry_window()
returns setof date language sql stable security definer set search_path to ''
as $$ select private.entry_window() where private.is_active_user() $$;
revoke all on function public.taqadi_entry_window() from public, anon;
grant execute on function public.taqadi_entry_window() to authenticated;

-- تأكيد المطابقة: للحسابات الثلاثة، ويُرفض إذا بقي نقص أو اختلاف.
create or replace function public.confirm_session_reconciliation(p_date date)
returns public.session_reconciliations language plpgsql security definer set search_path to ''
as $function$
declare me uuid := (select auth.uid()); me_name text; snap public.taqadi_day_snapshots; n_t int; n_o int; bad int; r public.session_reconciliations;
begin
  select display_name into me_name from public.profiles where id=me and is_active and role in ('judge','secretary');
  if me_name is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  select * into snap from public.taqadi_day_snapshots where session_date=p_date;
  if not found then raise exception 'لا توجد قائمة من تقاضي لهذا اليوم' using errcode='23514'; end if;
  select count(*) into n_t from jsonb_array_elements(snap.items);
  select count(*) into n_o from public.cases where session_date=p_date and deleted_at is null;
  select count(*) into bad from jsonb_array_elements(snap.items) x
   where not exists(select from public.cases c where c.session_date=p_date and c.deleted_at is null
                    and c.case_number=x->>'case_number' and to_char(c.session_time,'HH24:MI')=x->>'time');
  if bad>0 or n_t<>n_o then
    raise exception 'لا يمكن تأكيد المطابقة: يوجد نقص أو اختلاف لم يُعالج' using errcode='23514';
  end if;
  insert into public.session_reconciliations(session_date,confirmed_by,confirmed_by_name,confirmed_at,taqadi_count,organizer_count,snapshot_fetched_at)
  values(p_date,me,me_name,now(),n_t,n_o,snap.fetched_at)
  on conflict(session_date) do update set confirmed_by=excluded.confirmed_by,confirmed_by_name=excluded.confirmed_by_name,
    confirmed_at=now(),taqadi_count=excluded.taqadi_count,organizer_count=excluded.organizer_count,snapshot_fetched_at=excluded.snapshot_fetched_at
  returning * into r;
  return r;
end $function$;
revoke all on function public.confirm_session_reconciliation(date) from public, anon;
grant execute on function public.confirm_session_reconciliation(date) to authenticated;
