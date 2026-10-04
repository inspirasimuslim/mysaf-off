-- =============================================================================
-- mysaf-off — Pembersihan data besar-besaran, diminta 2026-10-04
--
-- Jalankan SELEPAS 20261004000115_reset_backup.sql (snapshot dalam schema
-- backup_20261004_reset). Pagar keselamatan sama corak
-- `20261001000101_clear_pipis_yuran.sql`: setiap baris hidup MESTI wujud
-- dalam snapshot sebelum apa-apa dipadam/di-null-kan.
--
-- Skop (SEMUA 324 ahli, bukan sebahagian):
--   1. members.kawasan_usrah                              -> null
--   2. members.sekolah_id                                 -> null
--   3. Yuran & Pipis — PADAM SEMUA baris (ledger+bayaran, sama macam 1 Okt)
--   4. members.status_pekerjaan + SELURUH kluster Pekerjaan -> null
--   5. members.status_perkahwinan + SELURUH kluster Keluarga -> null
--   6. members.alamat_semasa                               -> null
--   7. Usrah Perkaderan — PADAM SEMUA (kumpulan, mad'u, sesi, kehadiran,
--      DAN lantikan naqib) — mula semula penuh, arahan eksplisit.
--
-- TIDAK disentuh (bukan sebahagian arahan): members.alamat (alamat tetap),
-- member_businesses (Perniagaan — tidak disebut), member_education (post-
-- SPM — "sekolah" ialah sekolah_id sahaja, konsep berbeza), bil_anak
-- DISERTAKAN dalam kluster Keluarga kerana tidak bermakna tanpa konteks
-- perkahwinan.
-- =============================================================================

do $$
declare
  t text;
  extra bigint;
begin
  -- Pagar: setiap baris hidup pada table yang akan DIPADAM MESTI wujud dalam
  -- snapshot (bandingkan baris PENUH, bukan sekadar id — sama corak 1 Okt).
  foreach t in array array[
    'yuran_payments', 'yuran_group_payments', 'pipis_contributions', 'yuran_ledger',
    'sekolah_usrah_attendance', 'sekolah_usrah_sessions', 'sekolah_usrah_mad_u',
    'sekolah_usrah_groups', 'perkaderan_naqib_assignments'
  ] loop
    execute format(
      'select count(*) from (select * from public.%I except select * from backup_20261004_reset.%I) x',
      t, t || '_pre_reset'
    ) into extra;
    if extra > 0 then
      raise exception 'Table % ada % baris yang tiada dalam snapshot — pembersihan dibatalkan.', t, extra;
    end if;
  end loop;
end $$;


-- 1+2+4+5+6. members — null kolum berkaitan untuk SEMUA ahli ----------------
--
-- Trigger `members_sync_spouse_shared_fields` (migration 098) cuba
-- menyegerakkan bil_anak/tahun_berkahwin ke pasangan SETIAP baris diubah —
-- dalam SATU kenyataan UPDATE merentasi SEMUA baris, ini bercanggah dengan
-- baris pasangan yang turut sedang diubah oleh kenyataan yang sama ("tuple
-- to be updated was already modified"). Tidak diperlukan di sini — semua
-- ahli jadi NULL serentak, jadi tiada apa untuk disegerakkan. Dimatikan
-- sementara, dihidupkan semula serta-merta selepas UPDATE ini sahaja.
alter table public.members disable trigger members_sync_spouse_shared_fields;
alter table public.members disable trigger members_sync_spouse_link;

update public.members set
  -- 1. Kawasan Usrah
  kawasan_usrah = null,

  -- 2. Sekolah
  sekolah_id = null,

  -- 4. Pekerjaan (kluster penuh)
  status_pekerjaan = null,
  sektor_pekerjaan = null,
  bidang_kerajaan = null,
  bidang_kerajaan_lain_teks = null,
  kumpulan_bidang_swasta = null,
  bidang_khusus_swasta = null,
  bidang_khusus_swasta_lain_teks = null,
  jenis_kerja_sendiri = null,
  bidang_kerja_sendiri_lain_teks = null,
  bidang_pekerjaan_lama = null,
  jawatan_pekerjaan = null,
  nama_majikan = null,
  negeri_tempat_kerja = null,
  anggaran_pendapatan_range = null,

  -- 5. Perkahwinan / Keluarga (kluster penuh)
  status_perkahwinan = null,
  nama_pasangan = null,
  spouse_member_id = null,
  tahun_berkahwin = null,
  bil_anak = null,
  cenderung_baitul_muslim = null,
  sebab_bercerai_kematian = null,

  -- 6. Alamat semasa
  alamat_semasa = null;

alter table public.members enable trigger members_sync_spouse_shared_fields;
alter table public.members enable trigger members_sync_spouse_link;


-- 3. Yuran & Pipis — PADAM SEMUA (turutan FK: payments -> group_payments -> contributions -> ledger)
delete from public.yuran_payments;
delete from public.yuran_group_payments;
delete from public.pipis_contributions;
delete from public.yuran_ledger;


-- 7. Usrah Perkaderan — PADAM SEMUA (turutan FK: attendance -> sessions/mad_u -> groups; naqib berdiri sendiri)
delete from public.sekolah_usrah_attendance;
delete from public.sekolah_usrah_sessions;
delete from public.sekolah_usrah_mad_u;
delete from public.sekolah_usrah_groups;
delete from public.perkaderan_naqib_assignments;


do $$
declare
  n bigint;
begin
  select count(*) into n from public.members where
    kawasan_usrah is not null or sekolah_id is not null or status_pekerjaan is not null
    or status_perkahwinan is not null or alamat_semasa is not null or spouse_member_id is not null
    or bil_anak is not null;
  raise notice 'members baki medan yang dipadam (sepatutnya 0): %', n;

  select count(*) into n from public.yuran_ledger; raise notice 'yuran_ledger baki (sepatutnya 0): %', n;
  select count(*) into n from public.pipis_contributions; raise notice 'pipis_contributions baki (sepatutnya 0): %', n;
  select count(*) into n from public.sekolah_usrah_groups; raise notice 'sekolah_usrah_groups baki (sepatutnya 0): %', n;
  select count(*) into n from public.perkaderan_naqib_assignments; raise notice 'perkaderan_naqib_assignments baki (sepatutnya 0): %', n;
end $$;
