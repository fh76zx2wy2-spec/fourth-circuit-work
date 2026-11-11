create table public.judge_case_preparation (
  case_id uuid primary key references public.cases(id) on delete cascade,
  expected_outcome text check (expected_outcome in (
    'judgment', 'reserve_judgment', 'close_pleadings', 'study', 'reply',
    'evidence', 'expert', 'authority', 'notification', 'witnesses', 'oath',
    'settlement', 'stay', 'strike', 'inadmissible', 'other'
  )),
  custom_outcome text,
  judge_notes text,
  check (
    (expected_outcome is not distinct from 'other' and nullif(btrim(custom_outcome), '') is not null)
    or (expected_outcome is distinct from 'other' and custom_outcome is null)
  )
);

alter table public.judge_case_preparation enable row level security;
revoke all on public.judge_case_preparation from public, anon, authenticated;
grant select, insert, update, delete on public.judge_case_preparation to authenticated;

create policy judge_case_preparation_access on public.judge_case_preparation
  for all to authenticated
  using ((select private.is_judge()))
  with check ((select private.is_judge()));
