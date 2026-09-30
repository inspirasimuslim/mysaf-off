-- =============================================================================
-- mysaf-off — Tab Kesihatan (borang ahli): member_health_issues
--
-- Jalankan SELEPAS 20260929000084. Tiada snapshot dijana: migration ini
-- HANYA menambah table + fungsi baharu, tiada data/kolum sedia ada disentuh.
--
-- Data SENSITIF — RLS lebih ketat daripada tab lain. Akses ikut mekanisme
-- `admin_assignments` + `has_department_access('LAJNAH KEBAJIKAN', ...)` (sama
-- corak can_view_members / can_edit_usrah), BUKAN padanan teks carta
-- organisasi. Admin JABATAN DATA & SUMBER MANUSIA (can_view_members) TIDAK
-- mendapat akses secara automatik.
--
--   * pemilik rekod sendiri (`member_id` = ahli yang pautan `user_id`-nya
--     ialah pengguna semasa) — lihat + sunting rekod sendiri
--   * Super Admin (dirangkumi has_department_access)
--   * admin LAJNAH KEBAJIKAN: lihat jika can_view, sunting jika can_edit
-- =============================================================================


-- =============================================================================
-- 1. Fungsi kebenaran
--
-- Menerima `p_member_id` kerana pemilik ialah syarat PER-BARIS, bukan
-- per-pengguna. `uid` lalai `auth.uid()` (sama corak has_department_access).
-- =============================================================================

create or replace function public.can_view_health(p_member_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH KEBAJIKAN', false, uid)
      or exists (
        select 1 from public.members m
        where m.id = p_member_id and m.user_id = uid and uid is not null
      );
$$;

create or replace function public.can_edit_health(p_member_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH KEBAJIKAN', true, uid)
      or exists (
        select 1 from public.members m
        where m.id = p_member_id and m.user_id = uid and uid is not null
      );
$$;

revoke all on function public.can_view_health(uuid, uuid) from public, anon;
revoke all on function public.can_edit_health(uuid, uuid) from public, anon;
grant execute on function public.can_view_health(uuid, uuid) to authenticated;
grant execute on function public.can_edit_health(uuid, uuid) to authenticated;


-- =============================================================================
-- 2. TABLE member_health_issues (satu-ke-banyak, sama corak member_businesses)
--
-- `ada_temujanji_hospital`: boolean nullable (true = Ya, false = Tidak,
-- null = belum dijawab). `keterangan_lain` hanya untuk jenis 'lain_lain'.
-- 'tiada' dan 'tidak_mahu_nyatakan' tidak membawa medan tambahan.
-- =============================================================================

create table if not exists public.member_health_issues (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null references public.members (id) on delete cascade,
  jenis_masalah          text not null check (
    jenis_masalah in (
      'fizikal', 'mental', 'emosi', 'penyakit_kronik', 'oku', 'deria',
      'pertuturan_komunikasi', 'pembelajaran', 'tidur', 'pemakanan',
      'ketagihan', 'tiada', 'lain_lain', 'tidak_mahu_nyatakan'
    )
  ),
  nama_penyakit          text,
  ada_temujanji_hospital boolean,
  keterangan_lain        text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists member_health_issues_member_id_idx on public.member_health_issues (member_id);

drop trigger if exists member_health_issues_set_updated_at on public.member_health_issues;
create trigger member_health_issues_set_updated_at
  before update on public.member_health_issues
  for each row execute function public.set_updated_at();

alter table public.member_health_issues enable row level security;

-- Default privileges Supabase memberi hak berlebihan (TRUNCATE dll) — tarik
-- semua dahulu, kemudian beri hanya yang perlu.
revoke all on table public.member_health_issues from public, anon, authenticated;
grant select, insert, update, delete on table public.member_health_issues to authenticated;

drop policy if exists member_health_issues_select on public.member_health_issues;
create policy member_health_issues_select on public.member_health_issues
  for select to authenticated
  using (public.can_view_health(member_id));

drop policy if exists member_health_issues_insert on public.member_health_issues;
create policy member_health_issues_insert on public.member_health_issues
  for insert to authenticated
  with check (public.can_edit_health(member_id));

drop policy if exists member_health_issues_update on public.member_health_issues;
create policy member_health_issues_update on public.member_health_issues
  for update to authenticated
  using (public.can_edit_health(member_id))
  with check (public.can_edit_health(member_id));

drop policy if exists member_health_issues_delete on public.member_health_issues;
create policy member_health_issues_delete on public.member_health_issues
  for delete to authenticated
  using (public.can_edit_health(member_id));


-- =============================================================================
-- 3. RPC hubungan "Rais Lajnah Kebajikan"
--
-- Untuk mesej "Tidak mahu nyatakan" — TERBUKA kepada semua ahli log masuk
-- (memang tujuannya supaya nombor boleh dipapar). Hanya dua nilai dipulangkan
-- (nama + no_tel) untuk SATU jawatan. Padanan teks di sini hanya untuk PAPARAN
-- kenalan, BUKAN untuk kebenaran (RLS di atas tidak bergantung padanya).
-- Padanan (ejaan sebenar dalam DB): bahagian ilike '%Lajnah Kebajikan%'
-- (meliputi 'Lajnah Kebajikan (LK)'), jawatan tepat 'Rais' (abaikan huruf
-- besar/kecil + ruang tepi).
-- Tiada baris dipulangkan jika jawatan kosong / tidak dijumpai; `no_tel`
-- boleh null.
-- =============================================================================

create or replace function public.get_rais_lajnah_kebajikan()
returns table (
  nama   text,
  no_tel text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.full_name, nullif(btrim(m.no_tel), '')
  from public.org_positions p
  join public.members m on m.id = p.member_id
  where auth.uid() is not null
    and p.bahagian ilike '%Lajnah Kebajikan%'
    and lower(btrim(p.jawatan)) = 'rais'
  order by p.display_order
  limit 1;
$$;

revoke all on function public.get_rais_lajnah_kebajikan() from public, anon;
grant execute on function public.get_rais_lajnah_kebajikan() to authenticated;

notify pgrst, 'reload schema';
