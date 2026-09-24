-- =============================================================================
-- MySAFF — Maklum Balas Aplikasi
--
--   * Semua authenticated boleh INSERT untuk DIRI SENDIRI (member_id = my_member_id()).
--   * SELECT hanya Super Admin. Tiada UPDATE / DELETE untuk sesiapa melalui app.
--   * `list_app_feedback()` (Super Admin sahaja) menggabungkan nama + generasi ahli
--     supaya skrin admin tidak bergantung pada RLS `members`.
-- =============================================================================

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists app_feedback_created_idx on public.app_feedback (created_at desc);

alter table public.app_feedback enable row level security;

drop policy if exists app_feedback_insert on public.app_feedback;
create policy app_feedback_insert on public.app_feedback
  for insert to authenticated
  with check (member_id = public.my_member_id());

drop policy if exists app_feedback_select on public.app_feedback;
create policy app_feedback_select on public.app_feedback
  for select to authenticated
  using (public.is_super_admin());

-- DEFAULT PRIVILEGES projek ini memberi INSERT/UPDATE/DELETE automatik — buang semua dahulu.
revoke all on public.app_feedback from anon, authenticated;
grant select, insert on public.app_feedback to authenticated;

create or replace function public.list_app_feedback()
returns table (id uuid, full_name text, generasi text, message text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Super Admin boleh melihat maklum balas.' using errcode = '42501';
  end if;

  return query
    select f.id, m.full_name, m.generasi, f.message, f.created_at
    from public.app_feedback f
    join public.members m on m.id = f.member_id
    order by f.created_at desc;
end;
$$;

revoke all on function public.list_app_feedback() from public, anon;
grant execute on function public.list_app_feedback() to authenticated;

notify pgrst, 'reload schema';
