-- متابعة الإفادات والخطابات وتقارير الخبراء للقضايا المرفوعة لأجلها.
-- يُحدّث أمين السر حالتها، ويصل للقاضي إشعار عند كل حالة غير «بانتظار».
create table if not exists public.case_followups (
  case_id uuid primary key references public.cases(id) on delete cascade,
  case_number text not null,
  kind text not null check (kind in ('letter','expert','info','other')),
  status text not null default 'waiting' check (status in ('waiting','arrived','not_issued','no_reply','other')),
  note text not null default '' check (char_length(note)<=500),
  updated_by uuid references public.profiles(id),
  updated_by_name text,
  updated_at timestamptz not null default now()
);
alter table public.case_followups enable row level security;
revoke all on public.case_followups from public, anon, authenticated;
grant select on public.case_followups to authenticated;
create policy case_followups_read on public.case_followups for select to authenticated
  using ((select private.is_active_user()));

create or replace function public.set_case_followup(p_case_id uuid, p_kind text, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  me uuid := (select auth.uid()); me_name text; c public.cases; prev public.case_followups;
  kind_label text; status_label text;
begin
  select display_name into me_name from public.profiles where id=me and is_active and role in ('judge','secretary');
  if me_name is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  select * into c from public.cases where id=p_case_id and deleted_at is null;
  if not found then raise exception 'القضية غير موجودة'; end if;
  select * into prev from public.case_followups where case_id=p_case_id;
  if p_kind is null then
    delete from public.case_followups where case_id=p_case_id;
    return jsonb_build_object('removed',true);
  end if;
  insert into public.case_followups(case_id,case_number,kind,status,note,updated_by,updated_by_name,updated_at)
  values(p_case_id,c.case_number,p_kind,coalesce(p_status,'waiting'),btrim(coalesce(p_note,'')),me,me_name,now())
  on conflict(case_id) do update set kind=excluded.kind,status=excluded.status,note=excluded.note,
    updated_by=me,updated_by_name=me_name,updated_at=now();
  if coalesce(p_status,'waiting')<>'waiting' and (prev.case_id is null or prev.status is distinct from p_status or prev.note is distinct from btrim(coalesce(p_note,''))) then
    kind_label := case p_kind when 'letter' then 'الخطاب' when 'expert' then 'تقرير الخبير' when 'info' then 'الإفادة' else 'المتابعة' end;
    status_label := case p_status when 'arrived' then 'وصل' when 'not_issued' then 'لم يصدر لوجود خلل' when 'no_reply' then 'لم يرد' else 'تحديث' end;
    insert into public.notifications(recipient_id,actor_id,kind,message)
    select id,me,'updated',left(format('القضية %s (جلسة %s): %s — %s%s. بواسطة %s.',c.case_number,to_char(c.session_date,'YYYY-MM-DD'),
      kind_label,status_label,case when btrim(coalesce(p_note,''))<>'' then ' · '||btrim(p_note) else '' end,me_name),450)
    from public.profiles where is_active and role='judge' and id<>me;
  end if;
  return jsonb_build_object('saved',true);
end $function$;
revoke all on function public.set_case_followup(uuid,text,text,text) from public, anon;
grant execute on function public.set_case_followup(uuid,text,text,text) to authenticated;
alter publication supabase_realtime add table public.case_followups;
