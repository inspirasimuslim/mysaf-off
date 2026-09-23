-- =============================================================================
-- mysaf-off — Senarai Ahli Diputihkan
--
-- Jalankan SELEPAS 20260923000057_event_directory_all_exclude_archived_param.sql.
-- Idempotent.
--
-- Rekod SEJARAH ahli yang dibuang secara rasmi — bukan senarai ahli aktif.
-- BERDIRI SENDIRI (nama sebagai teks, BUKAN rujuk members.id): orang yang
-- disenaraikan di sini sudah bukan ahli dan mungkin tiada langsung rekod
-- `members` lagi (dipadam terus, bukan diarkib — lihat
-- `20260915000028_event_delete_archive.sql` untuk pola serupa pada acara).
--
-- Dimiliki oleh department SETIAUSAHA (bukan JABATAN SETIAUSAHA) — SAMA
-- department yang memiliki Carta Organisasi, lihat `ORG_CHART_DEPARTMENT`
-- dalam `lib/org-chart.ts`. Data sensitif: TIDAK terbuka kepada ahli biasa
-- atau admin department lain — `can_view_ahli_diputihkan()` ialah satu-satunya
-- laluan SELECT, tiada cabang "ahli lihat rekod sendiri" seperti PIPIS/yuran.
-- =============================================================================


-- =============================================================================
-- 1. TABLE
--
-- `generasi` rujuk `generations.code` (SAMA pola seperti `members.generasi`)
-- supaya borang boleh guna senarai generasi sedia ada dan nilai kekal konsisten
-- dengan seluruh app — bukan teks bebas yang boleh tersasar ejaan.
--
-- TIADA `sebab` terperinci — `catatan` sengaja ringkas dan opsyenal, ikut
-- prinsip minimum data sensitif: rekod ini wujud untuk INGAT SIAPA, bukan
-- untuk simpan naratif lengkap tentang kesalahan/sebab.
-- =============================================================================

create table if not exists public.ahli_diputihkan (
  id             uuid primary key default gen_random_uuid(),
  nama           text not null,
  generasi       text not null references public.generations (code) on update cascade on delete restrict,
  tahun_dibuang  int not null,
  catatan        text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ahli_diputihkan_tahun_idx
  on public.ahli_diputihkan (tahun_dibuang desc, created_at desc);


-- =============================================================================
-- 2. KEBENARAN
--
-- `has_department_access()` sudah mengandungi laluan Super Admin DAN semakan
-- sekatan akaun, jadi kedua-duanya tidak diulang di sini.
-- =============================================================================

create or replace function public.can_view_ahli_diputihkan(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('SETIAUSAHA', false, uid);
$$;

create or replace function public.can_edit_ahli_diputihkan(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('SETIAUSAHA', true, uid);
$$;

revoke all on function public.can_view_ahli_diputihkan(uuid) from public, anon;
revoke all on function public.can_edit_ahli_diputihkan(uuid) from public, anon;
grant execute on function public.can_view_ahli_diputihkan(uuid) to authenticated;
grant execute on function public.can_edit_ahli_diputihkan(uuid) to authenticated;


-- =============================================================================
-- 3. ROW LEVEL SECURITY
--
-- TIADA cabang akses diri sendiri (tiada `member_id` pun) — SELECT
-- terhad SEPENUHNYA kepada department SETIAUSAHA / Super Admin. TIADA UPDATE:
-- rekod ini ditambah atau dipadam, tidak disunting selepas dicipta.
-- =============================================================================

alter table public.ahli_diputihkan enable row level security;

drop policy if exists ahli_diputihkan_select on public.ahli_diputihkan;
create policy ahli_diputihkan_select on public.ahli_diputihkan
  for select to authenticated
  using (public.can_view_ahli_diputihkan());

drop policy if exists ahli_diputihkan_insert on public.ahli_diputihkan;
create policy ahli_diputihkan_insert on public.ahli_diputihkan
  for insert to authenticated with check (public.can_edit_ahli_diputihkan());

drop policy if exists ahli_diputihkan_delete on public.ahli_diputihkan;
create policy ahli_diputihkan_delete on public.ahli_diputihkan
  for delete to authenticated using (public.can_edit_ahli_diputihkan());

grant select, insert, delete on public.ahli_diputihkan to authenticated;

notify pgrst, 'reload schema';
