-- =============================================================================
-- mysaf-off — Padam/Arkib kumpulan & sesi Usrah Sekolah
--
-- Jalankan SELEPAS 20260922000052_perkaderan_naqib_browse_export_filter.sql.
-- Idempotent.
--
-- Kumpulan yang ADA sejarah sesi tidak boleh hard-delete (kekalkan rekod) —
-- ia diARKIBKAN (`is_active=false`) sebaliknya. Kumpulan KOSONG (tiada sesi
-- langsung) boleh hard-delete terus, tiada apa untuk hilang. Sesi pula
-- SENTIASA boleh hard-delete — sesi & kehadirannya SATU unit, tiada sebab
-- arkib berasingan untuknya.
-- =============================================================================

alter table public.sekolah_usrah_groups
  add column if not exists is_active boolean not null default true;


-- =============================================================================
-- DELETE dibuka SEMULA — TERHAD kepada scope pemilik/admin sahaja
--
-- `20260922000050_sekolah_usrah.sql` sengaja meREVOKE DELETE sepenuhnya
-- kerana ketika itu TIADA cara sah untuk memadam kumpulan/sesi langsung.
-- Sekarang ada (padam sesi, padam/arkib kumpulan naqib sendiri), jadi DELETE
-- dibuka semula tetapi MELALUI POLICY RLS yang tepat — bukan dibuka penuh
-- kepada `authenticated` (grant sahaja tidak mencukupi di projek ini; lihat
-- nota DEFAULT PRIVILEGES pada migration sebelum ini).
-- =============================================================================

drop policy if exists sekolah_usrah_groups_delete on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_delete on public.sekolah_usrah_groups
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or (public.is_active_naqib() and naqib_member_id = public.my_member_id())
  );

grant delete on public.sekolah_usrah_groups to authenticated;

drop policy if exists sekolah_usrah_sessions_delete on public.sekolah_usrah_sessions;
create policy sekolah_usrah_sessions_delete on public.sekolah_usrah_sessions
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_group(group_id)
  );

grant delete on public.sekolah_usrah_sessions to authenticated;

-- `sekolah_usrah_mad_u` KEKAL tanpa DELETE (soft-remove sahaja) — tiada
-- perubahan di sini. Cascade FK (`on delete cascade`) tetap memadam mad'u
-- bila KUMPULANNYA dipadam terus (kumpulan kosong sahaja boleh sampai ke
-- situ), dan itu berlaku di peringkat sistem, bukan tertakluk kepada RLS
-- `sekolah_usrah_mad_u`.


-- =============================================================================
-- perkaderan_naqib_overview() — kumpulan diarkibkan (is_active=false) tidak
-- dikira. `and g.is_active` diletak pada syarat JOIN (bukan WHERE) supaya
-- naqib yang SEMUA kumpulannya diarkibkan tetap tersenarai (dengan "Tiada
-- kumpulan"), bukan hilang terus daripada senarai admin.
-- =============================================================================

create or replace function public.perkaderan_naqib_overview()
returns table (
  member_id     uuid,
  full_name     text,
  generasi      text,
  sekolah_list  text,
  group_count   bigint,
  session_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.full_name,
    m.generasi,
    coalesce(string_agg(distinct g.sekolah, ', ' order by g.sekolah), 'Tiada kumpulan'),
    count(distinct g.id),
    count(s.id)
  from public.perkaderan_naqib_assignments a
  join public.members m on m.id = a.member_id
  left join public.sekolah_usrah_groups g on g.naqib_member_id = m.id and g.is_active
  left join public.sekolah_usrah_sessions s on s.group_id = g.id
  where a.is_active = true
    and (public.is_super_admin() or public.can_view_perkaderan())
  group by m.id, m.full_name, m.generasi
  order by m.full_name;
$$;

notify pgrst, 'reload schema';
