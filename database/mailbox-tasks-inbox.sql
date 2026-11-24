-- مهام البريد التي أنشأتها المهمة المجدولة تظهر في "الواردة لي" للقاضي، لا في "المرسلة مني"،
-- ويظهر مرسلها في الواجهة "البريد". (مطبّق على Supabase باسم mailbox_tasks_in_judge_inbox)
create or replace function private.is_mailbox_task(task public.tasks)
 returns boolean language sql stable set search_path to ''
as $$ select task.source='email' and task.category='email' and task.assigned_to=array[task.created_by] $$;

create or replace function public.sent_by_me(task public.tasks)
 returns boolean language sql stable set search_path to ''
as $$ select private.is_original_task_sender(task.created_by) and not private.is_mailbox_task(task) $$;
