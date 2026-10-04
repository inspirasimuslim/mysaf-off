-- =============================================================================
-- mysaf-off — Kosongkan data Usrah Tarbiah utama (diminta 2026-10-04)
--
-- Permintaan eksplisit: "Clear semua data usrah tarbiah". Skop DISAHKAN
-- dengan pengguna sebelum dijalankan — HANYA tiga jadual sistem Usrah
-- Tarbiah UTAMA (dipaparkan di skrin Statistik Tarbiah & dikira dalam
-- Penarafan Aktiviti Ahli):
--   * usrah_events             (19 baris sebelum padam)
--   * usrah_attendance_scans   (21 baris)
--   * usrah_monthly_attendance (11,628 baris)
--
-- "Perkaderan Usrah Sekolah" (naqib/mad'u — sekolah_usrah_groups/mad_u/
-- sessions/attendance, perkaderan_naqib_assignments) ialah sistem
-- BERASINGAN, SENGAJA TIDAK disentuh oleh migration ini.
--
-- Snapshot rollback DAHULU (corak sama rombak-rombak 2026-09-29) ke schema
-- `backup_20261004` sebelum padam — tiga jadual ini boleh dipulihkan semula
-- daripada snapshot jika diperlukan.
-- =============================================================================

create schema if not exists backup_20261004;

create table backup_20261004.usrah_events_pre_clear as
  table public.usrah_events;

create table backup_20261004.usrah_attendance_scans_pre_clear as
  table public.usrah_attendance_scans;

create table backup_20261004.usrah_monthly_attendance_pre_clear as
  table public.usrah_monthly_attendance;

-- Padam scans dahulu secara eksplisit (walaupun `on delete cascade` daripada
-- usrah_events akan buat perkara sama) supaya langkah ini jelas dan tidak
-- bergantung senyap pada tingkah laku FK; monthly_attendance tiada FK kepada
-- usrah_events, jadi tidak terjejas oleh cascade — dipadam berasingan.
delete from public.usrah_attendance_scans;
delete from public.usrah_events;
delete from public.usrah_monthly_attendance;

notify pgrst, 'reload schema';
