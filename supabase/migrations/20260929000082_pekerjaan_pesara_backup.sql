-- =============================================================================
-- mysaf-off — Titik rollback SEBELUM kolum `bidang_pekerjaan_lama` (Pekerjaan)
--
-- Jalankan SEBELUM 20260929000083_pekerjaan_pesara_dan_completeness_v5.sql.
-- Ditambah ke schema `backup_20260929` sedia ada; sengaja tidak mengisi semula
-- jika table sudah wujud — snapshot kekal beku.
-- =============================================================================

create table if not exists backup_20260929.members_pre_pekerjaan_pesara as
table public.members;

comment on table backup_20260929.members_pre_pekerjaan_pesara is
  'Salinan public.members SEBELUM 20260929000083. Rollback point, bukan table hidup — jangan tulis padanya.';
