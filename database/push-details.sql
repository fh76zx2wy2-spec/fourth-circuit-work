-- إشعارات الجوال بالتفاصيل (2026-11-22): claim_case_push يضيف لكل إشعار مهمة حقل text={title,body}
-- من private.push_text، ودالة الإرسال case-submission-push تمرره في محتوى Web Push (مشفّر حتى الجهاز)،
-- و case-push-sw.js يعرضه. أُضيف حدث «directive» (توجيه القاضي لمرسل المهمة) في change_task_assignment.
create or replace function private.push_text(p_task uuid, p_event text)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare t public.tasks; who text; a public.task_assignments; ttl text; body text; line text;
begin
 if p_task is null then return null; end if;
 select * into t from public.tasks where id=p_task;
 if not found then return null; end if;
 line := t.title || coalesce(' · القضية '||substring(t.case_number from '\d{9,10}'),'');
 if p_event='assigned' then
   select display_name into who from public.profiles where id=t.created_by;
   ttl := 'مهمة جديدة من '||coalesce(who,'');
   body := line || case when coalesce(btrim(t.details),'')<>'' then E'\n'||left(btrim(t.details),140)
                        when coalesce(btrim(t.proposed_action),'')<>'' then E'\nالمقترح: '||left(btrim(t.proposed_action),140) else '' end;
 elsif p_event like 'executed:%' then
   select * into a from public.task_assignments where task_id=p_task and assignee_id=nullif(split_part(p_event,':',2),'')::uuid;
   ttl := 'نفّذ '||coalesce(a.assignee_name,'الموظف')||' المهمة';
   body := line || case when a.execution_note is not null then E'\n«'||left(a.execution_note,160)||'»' else '' end;
 elsif p_event like 'returned:%' then
   select * into a from public.task_assignments where task_id=p_task and assignee_id=nullif(split_part(p_event,':',2),'')::uuid;
   ttl := 'أُعيدت إليك مهمة';
   body := line || case when a.return_reason is not null then E'\nالسبب: '||left(a.return_reason,160) else '' end;
 elsif p_event='directive' then
   ttl := 'توجيه القاضي';
   body := line || case when t.judge_directive is not null then E'\n'||left(t.judge_directive,180) else '' end;
 else
   return null;
 end if;
 return jsonb_build_object('title',left(ttl,80),'body',left(body,300));
end $function$;
revoke all on function private.push_text(uuid,text) from public, anon, authenticated;
-- claim_case_push: نفس السابق مع 'text',private.push_text(c.task_id,c.task_event) في كل job.
