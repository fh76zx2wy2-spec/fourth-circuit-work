-- مصدر المهمة: البريد الإلكتروني
-- يضيف حقول المصدر للمهام، ودالتين خاصتين (لا تُستدعى من المتصفح) لإنشاء مهمة من البريد
-- أو وسم مهمة موجودة بأنها وصلت من البريد، ويجعل إشعار الموظفين يذكر المصدر والمرسل.

alter table public.tasks
  add column if not exists source text not null default 'manual',
  add column if not exists source_sender text,
  add column if not exists source_subject text,
  add column if not exists source_received_at timestamptz,
  add column if not exists source_message_id text;

do $$ begin
  alter table public.tasks add constraint tasks_source_check check (source in ('manual','email'));
exception when duplicate_object then null; end $$;

create unique index if not exists tasks_source_message_id_key
  on public.tasks(source_message_id) where source_message_id is not null;

-- يمنع تعديل حقول المصدر من الواجهة؛ لا تتغير إلا عبر الدوال الخاصة أدناه.
create or replace function private.guard_task_write()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare acting_role text;
begin
 select role into acting_role from public.profiles where id=(select auth.uid()) and is_active;
 if acting_role is null then raise exception 'Inactive account'; end if;
 if coalesce(current_setting('app.email_source',true),'')<>'1' then
   if TG_OP='INSERT' then
     new.source:='manual';new.source_sender:=null;new.source_subject:=null;new.source_received_at:=null;new.source_message_id:=null;
   else
     new.source:=old.source;new.source_sender:=old.source_sender;new.source_subject:=old.source_subject;
     new.source_received_at:=old.source_received_at;new.source_message_id:=old.source_message_id;
   end if;
 end if;
 if TG_OP='UPDATE' then
   new.created_by:=old.created_by; new.created_at:=old.created_at;
   if new.status is distinct from old.status and acting_role<>'judge' then
     raise exception 'Only the judge can change task completion';
   end if;
 end if;
 new.updated_by:=(select auth.uid()); new.updated_at:=now();
 if new.status='done' then
   if TG_OP='INSERT' and acting_role<>'judge' then raise exception 'Only the judge can complete tasks'; end if;
   new.completed_by:=coalesce(case when TG_OP='UPDATE' and old.status='done' then old.completed_by end,(select auth.uid()));
   new.completed_at:=coalesce(case when TG_OP='UPDATE' and old.status='done' then old.completed_at end,now());
 else
   new.completed_by:=null;new.completed_at:=null;
 end if;
 return new;
end; $function$;

-- الإشعار يذكر أن المهمة وصلت من البريد ومن المرسل.
create or replace function private.notify_task_write()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
 target uuid;
 sender_name text;
 msg text;
begin
 if tg_op='UPDATE' then
   if new.assigned_to is distinct from old.assigned_to
      or new.status is distinct from old.status or new.deleted_at is distinct from old.deleted_at then
     raise exception 'Use task assignment workflow' using errcode='42501';
   end if;
   insert into public.task_revisions(task_id,changed_by,old_record) values(old.id,auth.uid(),to_jsonb(old));
   return new;
 end if;
 if new.status <> 'open' or new.deleted_at is not null then raise exception 'Invalid new task'; end if;
 if coalesce(cardinality(new.assigned_to),0) not between 1 and 3 then raise exception 'اختر من توجه إليه المهمة.' using errcode='23514'; end if;
 select display_name into sender_name from public.profiles where id=new.created_by;
 msg:=case when new.source='email'
   then format('📧 مهمة وصلت من البريد (المرسل: %s) أضافها %s: %s',coalesce(nullif(new.source_sender,''),'غير معروف'),sender_name,new.title)
   else format('مهمة جديدة من %s: %s',sender_name,new.title) end;
 for target in select distinct unnest(new.assigned_to) loop
   insert into public.task_assignments(task_id,assignee_id,assignee_name)
   select new.id,id,display_name from public.profiles where id=target and is_active and role in ('judge','secretary');
   if not found then raise exception 'Invalid task recipient' using errcode='23514'; end if;
   insert into public.notifications(recipient_id,actor_id,task_id,kind,message)
   values(target,new.created_by,new.id,'task_created',left(msg,450));
   perform private.push_directed_task(new.id,target,'assigned',0);
 end loop;
 return new;
end $function$;

-- إنشاء مهمة من البريد باسم القاضي وتوجيهها للموظفين (للمهمة المجدولة فقط).
create or replace function private.create_email_task(
  p_title text, p_details text, p_sender text, p_subject text, p_received_at timestamptz,
  p_message_id text, p_assignees uuid[], p_case_number text default '', p_priority text default 'normal', p_due_date date default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare judge uuid; new_id uuid;
begin
  select id into new_id from public.tasks where source_message_id=p_message_id and deleted_at is null;
  if new_id is not null then return new_id; end if;
  select id into judge from public.profiles where role='judge' and is_active order by created_at limit 1;
  perform set_config('request.jwt.claim.sub',judge::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',judge,'role','authenticated')::text,true);
  perform set_config('app.email_source','1',true);
  insert into public.tasks(title,category,case_number,details,priority,due_date,created_by,assigned_to,
    source,source_sender,source_subject,source_received_at,source_message_id)
  values(left(p_title,220),'email',coalesce(p_case_number,''),
    coalesce(p_details,'')||E'\n\n— وصلت هذه المهمة من البريد. المرسل: '||coalesce(p_sender,'غير معروف')||' · الموضوع: '||coalesce(p_subject,''),
    coalesce(p_priority,'normal'),p_due_date,judge,p_assignees,
    'email',p_sender,p_subject,p_received_at,p_message_id)
  returning id into new_id;
  perform set_config('app.email_source','',true);
  return new_id;
end $function$;

-- وسم مهمة أضافها الموظف مسبقًا بأنها وصلت من البريد.
create or replace function private.tag_task_from_email(
  p_task_id uuid, p_sender text, p_subject text, p_received_at timestamptz, p_message_id text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare judge uuid;
begin
  select id into judge from public.profiles where role='judge' and is_active order by created_at limit 1;
  perform set_config('request.jwt.claim.sub',judge::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',judge,'role','authenticated')::text,true);
  perform set_config('app.email_source','1',true);
  update public.tasks set source='email',source_sender=p_sender,source_subject=p_subject,
    source_received_at=p_received_at,source_message_id=coalesce(source_message_id,p_message_id)
  where id=p_task_id and source<>'email';
  perform set_config('app.email_source','',true);
end $function$;

revoke all on function private.create_email_task(text,text,text,text,timestamptz,text,uuid[],text,text,date) from public, anon, authenticated;
revoke all on function private.tag_task_from_email(uuid,text,text,timestamptz,text) from public, anon, authenticated;

-- الإصدار المعتمد: المهمة توجه للقاضي، ويصل الموظفين إشعار بأنها وصلت للقاضي من البريد.
-- (مطبّق على قاعدة البيانات باسم private.create_email_task_for_judge؛ راجع سجل الترحيلات في Supabase.)
