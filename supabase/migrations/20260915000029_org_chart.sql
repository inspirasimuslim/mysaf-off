-- =============================================================================
-- MySAFF — Carta Organisasi (sesi 2025/2027)
--
-- Jalankan SELEPAS 20260915000028_event_delete_archive.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Satu baris = satu jawatan dalam satu bahagian. Bahagian tidak mempunyai table
-- sendiri: ia wujud selagi ada sekurang-kurangnya satu jawatan di dalamnya, dan
-- susunannya ditentukan oleh `display_order` jawatan pertamanya. `display_order`
-- ialah SATU jujukan global — menyusun semua baris mengikutnya menghasilkan
-- bahagian dalam urutan yang betul DAN jawatan dalam setiap bahagian dalam
-- urutan yang betul, tanpa dua kolum susunan yang boleh bercanggah.
--
-- Pemilik modul ialah department 'SETIAUSAHA' — BUKAN 'JABATAN SETIAUSAHA'.
-- Kedua-duanya department berasingan dalam `20260906000001_roles_permissions.sql`;
-- JABATAN SETIAUSAHA memiliki Program dan Pengumuman, SETIAUSAHA memiliki carta
-- ini. Seorang admin boleh memegang satu tanpa yang satu lagi.
-- =============================================================================


-- 1. TABLE ----------------------------------------------------------------------

create table if not exists public.org_positions (
  id            uuid primary key default gen_random_uuid(),
  bahagian      text not null check (length(btrim(bahagian)) > 0),
  jawatan       text not null check (length(btrim(jawatan)) > 0),
  -- NULL = jawatan kosong. `set null` supaya memadam rekod ahli mengosongkan
  -- jawatannya dan bukan menghapuskan jawatan itu dari struktur.
  member_id     uuid references public.members (id) on delete set null,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists org_positions_display_order_idx on public.org_positions (display_order);
create index if not exists org_positions_member_id_idx on public.org_positions (member_id);

drop trigger if exists org_positions_set_updated_at on public.org_positions;
create trigger org_positions_set_updated_at
  before update on public.org_positions
  for each row execute function public.set_updated_at();


-- 2. AKSES ----------------------------------------------------------------------
--
-- Nama department ditulis SEKALI di sini. `has_department_access()` sudah
-- merangkumi Super Admin.

create or replace function public.can_edit_org_chart(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('SETIAUSAHA', true, uid);
$$;

revoke all on function public.can_edit_org_chart(uuid) from public, anon;
grant execute on function public.can_edit_org_chart(uuid) to authenticated;


-- 3. RLS ------------------------------------------------------------------------
--
-- Carta organisasi ialah maklumat terbuka kepada semua ahli yang log masuk.
-- TULISAN hanya untuk admin SETIAUSAHA (can_edit) dan Super Admin — ahli biasa
-- tidak boleh menyunting, termasuk jawatan yang dipegangnya sendiri.

alter table public.org_positions enable row level security;

revoke all on table public.org_positions from anon;

drop policy if exists org_positions_select on public.org_positions;
create policy org_positions_select on public.org_positions
  for select to authenticated
  using (true);

drop policy if exists org_positions_insert on public.org_positions;
create policy org_positions_insert on public.org_positions
  for insert to authenticated
  with check (public.can_edit_org_chart());

drop policy if exists org_positions_update on public.org_positions;
create policy org_positions_update on public.org_positions
  for update to authenticated
  using (public.can_edit_org_chart())
  with check (public.can_edit_org_chart());

drop policy if exists org_positions_delete on public.org_positions;
create policy org_positions_delete on public.org_positions
  for delete to authenticated
  using (public.can_edit_org_chart());


-- 4. BACAAN CARTA ---------------------------------------------------------------
--
-- `security definer` atas sebab yang sama seperti `list_members_directory()`:
-- ahli biasa tidak boleh membaca `members` melalui RLS, sedangkan carta perlu
-- nama dan avatar pemegang jawatan. Tiga kolum paparan sahaja didedahkan, dan
-- hanya bagi ahli yang MEMEGANG jawatan.

create or replace function public.list_org_chart()
returns table (
  id            uuid,
  bahagian      text,
  jawatan       text,
  display_order integer,
  member_id     uuid,
  full_name     text,
  generasi      text,
  avatar_url    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.bahagian,
    p.jawatan,
    p.display_order,
    p.member_id,
    m.full_name,
    m.generasi,
    m.avatar_url
  from public.org_positions p
  left join public.members m on m.id = p.member_id
  where auth.uid() is not null
  order by p.display_order, p.created_at;
$$;

revoke all on function public.list_org_chart() from public, anon;
grant execute on function public.list_org_chart() to authenticated;


-- 5. PILIHAN AHLI UNTUK ADMIN ---------------------------------------------------
--
-- Admin SETIAUSAHA belum tentu memegang kebenaran membaca `members`, dan
-- direktori sengaja tidak mendedahkan `id`. Fungsi ini memulangkan `id` untuk
-- pemilih ahli — hanya kepada sesiapa yang boleh menyunting carta.

create or replace function public.org_chart_member_options()
returns table (
  id         uuid,
  full_name  text,
  generasi   text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.generasi, m.avatar_url
  from public.members m
  where public.can_edit_org_chart()
  order by m.full_name;
$$;

revoke all on function public.org_chart_member_options() from public, anon;
grant execute on function public.org_chart_member_options() to authenticated;


-- 6. TAMBAH JAWATAN -------------------------------------------------------------
--
-- Jawatan baharu diletakkan di HUJUNG bahagiannya, bukan di hujung carta —
-- baris selepasnya dianjak satu. Bahagian yang belum wujud diletakkan di hujung
-- carta. `security invoker`: RLS tetap terpakai pada setiap tulisan; semakan
-- eksplisit di atas hanya untuk mesej yang jelas.

create or replace function public.org_chart_add_position(
  p_bahagian  text,
  p_jawatan   text,
  p_member_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_last integer;
  v_id   uuid;
begin
  if not public.can_edit_org_chart() then
    raise exception 'Anda tiada kebenaran menyunting carta organisasi.' using errcode = '42501';
  end if;

  select max(p.display_order) into v_last
  from public.org_positions p
  where p.bahagian = btrim(p_bahagian);

  if v_last is null then
    select coalesce(max(p.display_order), 0) into v_last from public.org_positions p;
  else
    update public.org_positions p
    set display_order = p.display_order + 1
    where p.display_order > v_last;
  end if;

  insert into public.org_positions (bahagian, jawatan, member_id, display_order)
  values (btrim(p_bahagian), btrim(p_jawatan), p_member_id, v_last + 1)
  returning org_positions.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.org_chart_add_position(text, text, uuid) from public, anon;
grant execute on function public.org_chart_add_position(text, text, uuid) to authenticated;


-- 7. SUSUN SEMULA ---------------------------------------------------------------
--
-- App menghantar SELURUH jujukan id dalam susunan baharu dan setiap baris
-- dinomborkan semula 1..n dalam satu kenyataan — menaikkan bahagian atau
-- jawatan tidak pernah meninggalkan carta separuh tersusun.

create or replace function public.org_chart_reorder(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.can_edit_org_chart() then
    raise exception 'Anda tiada kebenaran menyunting carta organisasi.' using errcode = '42501';
  end if;

  update public.org_positions p
  set display_order = o.ord::integer
  from unnest(p_ids) with ordinality as o(id, ord)
  where p.id = o.id
    and p.display_order is distinct from o.ord::integer;
end;
$$;

revoke all on function public.org_chart_reorder(uuid[]) from public, anon;
grant execute on function public.org_chart_reorder(uuid[]) to authenticated;

notify pgrst, 'reload schema';
