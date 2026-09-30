-- =============================================================================
-- mysaf-off — Titik rollback SEBELUM rombak tab Pekerjaan (borang ahli)
--
-- Jalankan SEBELUM 20260929000080_pekerjaan_rombak.sql. Migration seterusnya
-- itu menukar constraint `sektor_pekerjaan` (separuh_kerajaan_glc -> glc),
-- menukar bracket `anggaran_pendapatan_range` ('10000+' dipecah 3) dan
-- mengosongkan '10000+' pada `members` DAN `member_businesses` — snapshot ini
-- ialah jalan rollback (docker/pg_dump tidak tersedia).
--
-- Ditambah ke schema `backup_20260929` sedia ada. Sengaja tidak mengisi semula
-- jika table sudah wujud — snapshot kekal beku pada keadaan SEBELUM rombak.
-- =============================================================================

create table if not exists backup_20260929.members_pre_pekerjaan_rombak as
table public.members;

create table if not exists backup_20260929.member_businesses_pre_pekerjaan_rombak as
table public.member_businesses;

comment on table backup_20260929.members_pre_pekerjaan_rombak is
  'Salinan public.members SEBELUM 20260929000080_pekerjaan_rombak.sql. Rollback point, bukan table hidup — jangan tulis padanya.';
comment on table backup_20260929.member_businesses_pre_pekerjaan_rombak is
  'Salinan public.member_businesses SEBELUM 20260929000080_pekerjaan_rombak.sql. Rollback point, bukan table hidup.';
