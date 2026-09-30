-- =============================================================================
-- mysaf-off — Titik rollback SEBELUM buang `nama_anak` + tambah jawatan_rasmi /
-- cenderung_baitul_muslim
--
-- Jalankan SEBELUM 20260929000087_keluarga_jawatan_rasmi.sql. Migration itu
-- MEMADAM kolum `members.nama_anak` — snapshot ini satu-satunya jalan pulih.
-- Sengaja tidak mengisi semula jika table sudah wujud (snapshot kekal beku).
-- =============================================================================

create table if not exists backup_20260929.members_pre_keluarga_jawatan as
table public.members;

comment on table backup_20260929.members_pre_keluarga_jawatan is
  'Salinan public.members SEBELUM 20260929000087. Rollback point, bukan table hidup — jangan tulis padanya.';
