-- =============================================================================
-- mysaf-off — Bersihkan medan kerja tersangkut pada ahli Tidak Bekerja (096)
--
-- Punca: sebelum ini borang hanya menukar `status_pekerjaan` bila ahli beralih
-- ke "Tidak Bekerja"; sektor/bidang/jenis/jawatan/majikan/negeri/pendapatan
-- kekal tersimpan dan keluar dalam eksport. Borang kini mengosongkannya
-- (`NOT_WORKING_CLEARED`); migration ini membersihkan baris sedia ada.
--
-- Skop KONSERVATIF:
--   (a) `status_pekerjaan` TERISI dan bukan 'bekerja' (ahli sudah memilih
--       Suri Rumah/Pesara/Tidak Bekerja) -> kosongkan semua medan cabang kerja.
--       Ahli `status_pekerjaan` NULL TIDAK disentuh — mereka belum mengisi
--       semula selepas rombak 074 dan mungkin masih memegang data lama sah.
--   (b) `jenis_kerja_sendiri`/`bidang_kerja_sendiri_lain_teks` bila sektor
--       BUKAN 'sendiri' -> dikosongkan (tiada UI yang memaparkannya).
--
-- Snapshot rollback (baris terjejas sahaja): backup_20260929.members_pre_pekerjaan_stale_cleanup
-- =============================================================================

create table backup_20260929.members_pre_pekerjaan_stale_cleanup as
select id, status_pekerjaan, sektor_pekerjaan, bidang_kerajaan, bidang_kerajaan_lain_teks,
       kumpulan_bidang_swasta, bidang_khusus_swasta, bidang_khusus_swasta_lain_teks,
       jenis_kerja_sendiri, bidang_kerja_sendiri_lain_teks, jawatan_pekerjaan, nama_majikan,
       negeri_tempat_kerja, anggaran_pendapatan_range
from public.members
where (status_pekerjaan is not null and status_pekerjaan <> 'bekerja'
       and (sektor_pekerjaan is not null or bidang_kerajaan is not null or bidang_kerajaan_lain_teks is not null
            or kumpulan_bidang_swasta is not null or bidang_khusus_swasta is not null
            or bidang_khusus_swasta_lain_teks is not null or jenis_kerja_sendiri is not null
            or bidang_kerja_sendiri_lain_teks is not null or jawatan_pekerjaan is not null
            or nama_majikan is not null or negeri_tempat_kerja is not null
            or anggaran_pendapatan_range is not null))
   or ((jenis_kerja_sendiri is not null or bidang_kerja_sendiri_lain_teks is not null)
       and sektor_pekerjaan is distinct from 'sendiri');

do $$
declare
  n_status int;
  n_sendiri int;
begin
  update public.members set
    sektor_pekerjaan = null, bidang_kerajaan = null, bidang_kerajaan_lain_teks = null,
    kumpulan_bidang_swasta = null, bidang_khusus_swasta = null, bidang_khusus_swasta_lain_teks = null,
    jenis_kerja_sendiri = null, bidang_kerja_sendiri_lain_teks = null, jawatan_pekerjaan = null,
    nama_majikan = null, negeri_tempat_kerja = null, anggaran_pendapatan_range = null
  where status_pekerjaan is not null and status_pekerjaan <> 'bekerja'
    and (sektor_pekerjaan is not null or bidang_kerajaan is not null or bidang_kerajaan_lain_teks is not null
         or kumpulan_bidang_swasta is not null or bidang_khusus_swasta is not null
         or bidang_khusus_swasta_lain_teks is not null or jenis_kerja_sendiri is not null
         or bidang_kerja_sendiri_lain_teks is not null or jawatan_pekerjaan is not null
         or nama_majikan is not null or negeri_tempat_kerja is not null
         or anggaran_pendapatan_range is not null);
  get diagnostics n_status = row_count;

  update public.members set jenis_kerja_sendiri = null, bidang_kerja_sendiri_lain_teks = null
  where (jenis_kerja_sendiri is not null or bidang_kerja_sendiri_lain_teks is not null)
    and sektor_pekerjaan is distinct from 'sendiri';
  get diagnostics n_sendiri = row_count;

  raise notice 'Pembersihan: % ahli tidak bekerja dibersihkan, % ahli jenis/bidang sendiri tersangkut dibersihkan.',
    n_status, n_sendiri;
end $$;
