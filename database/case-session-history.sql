-- ملف القضية الزمني: نصوص الجلسات السابقة المسحوبة من تقاضي.
-- القراءة لكل حساب مفعّل (القاضي وأمينا السر)، ولا كتابة من الواجهة.
create table public.case_session_history (
  case_number text not null check (case_number ~ '^\d{9,10}$'),
  session_hijri text not null check (session_hijri ~ '^\d{2}/\d{2}/\d{4}$'),
  session_key text generated always as (substr(session_hijri,7,4)||'-'||substr(session_hijri,4,2)||'-'||substr(session_hijri,1,2)) stored,
  minutes text not null default '',
  outcome text,
  outcome_evidence text,
  is_result boolean not null default false,
  fetched_at timestamptz not null default now(),
  primary key (case_number, session_hijri)
);
alter table public.case_session_history enable row level security;
revoke all on public.case_session_history from public, anon, authenticated;
grant select on public.case_session_history to authenticated;
create policy session_history_read on public.case_session_history for select to authenticated
  using ((select private.is_active_user()));
