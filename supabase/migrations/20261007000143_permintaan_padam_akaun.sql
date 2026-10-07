-- Permintaan padam akaun (syarat Google Play: padam akaun mesti boleh dimohon dari dalam app).
-- Sengaja BERASASKAN PERMINTAAN, bukan padam serta-merta: ahli mempunyai rekod yuran, PIPIS dan
-- kehadiran yang terikat pada akaun persatuan. Super Admin menyemak dan memproses (diputihkan /
-- dianonimkan) kemudian menanda permintaan selesai.
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  alasan text,
  status text not null default 'pending' check (status in ('pending', 'selesai', 'ditolak')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid
);

create unique index if not exists account_deletion_one_pending
  on public.account_deletion_requests (member_id) where status = 'pending';

alter table public.account_deletion_requests enable row level security;

drop policy if exists account_deletion_select on public.account_deletion_requests;
create policy account_deletion_select on public.account_deletion_requests
  for select to authenticated
  using (member_id = public.my_member_id() or public.is_super_admin());
-- Tiada polisi insert/update/delete: semua melalui RPC di bawah.

create or replace function public.request_account_deletion(p_alasan text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
begin
  if v_member is null then
    raise exception 'Akaun ahli tidak ditemui.';
  end if;

  insert into public.account_deletion_requests (member_id, alasan)
  values (v_member, nullif(left(trim(coalesce(p_alasan, '')), 500), ''))
  on conflict (member_id) where status = 'pending' do nothing;
end;
$$;

create or replace function public.my_account_deletion_pending()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.account_deletion_requests
    where member_id = public.my_member_id() and status = 'pending'
  );
$$;

create or replace function public.list_account_deletion_requests()
returns table (id uuid, member_id uuid, full_name text, generasi text, alasan text, status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Tiada kebenaran.';
  end if;

  return query
  select r.id, r.member_id, m.full_name, m.generasi, r.alasan, r.status, r.created_at
  from public.account_deletion_requests r
  join public.members m on m.id = r.member_id
  order by (r.status = 'pending') desc, r.created_at desc;
end;
$$;

create or replace function public.resolve_account_deletion_request(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Tiada kebenaran.';
  end if;
  if p_status not in ('selesai', 'ditolak') then
    raise exception 'Status tidak sah.';
  end if;

  update public.account_deletion_requests
  set status = p_status, processed_at = now(), processed_by = auth.uid()
  where id = p_id and status = 'pending';
end;
$$;

revoke all on function public.request_account_deletion(text) from public, anon;
revoke all on function public.my_account_deletion_pending() from public, anon;
revoke all on function public.list_account_deletion_requests() from public, anon;
revoke all on function public.resolve_account_deletion_request(uuid, text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.my_account_deletion_pending() to authenticated;
grant execute on function public.list_account_deletion_requests() to authenticated;
grant execute on function public.resolve_account_deletion_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';
