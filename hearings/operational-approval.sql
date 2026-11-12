-- The three existing linked accounts can approve schedules. Their account roles are unchanged.
update public.profiles p
set can_approve = true
from private.hearings_account_links link
where link.hearings_user_id = p.user_id
  and p.user_id in (
    '83fa976a-29e8-4c44-b79c-52a691ec1fdb',
    '1fc76c93-42a3-449c-a563-8531288f9dbd'
  )
  and p.role = 'secretary';
