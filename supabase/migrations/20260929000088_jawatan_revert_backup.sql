-- =============================================================================
-- mysaf-off — Titik rollback SEBELUM revert `jawatan_rasmi`
--
-- Jalankan SEBELUM 20260929000089_jawatan_dari_carta.sql. Migration itu
-- MEMADAM kolum `members.jawatan_rasmi` (data kemungkinan kosong, tetapi
-- snapshot tetap dijana mengikut corak biasa).
-- Sengaja tidak mengisi semula jika table sudah wujud (snapshot kekal beku).
-- =============================================================================

create table if not exists backup_20260929.members_pre_jawatan_revert as
table public.members;

comment on table backup_20260929.members_pre_jawatan_revert is
  'Salinan public.members SEBELUM 20260929000089. Rollback point, bukan table hidup — jangan tulis padanya.';
