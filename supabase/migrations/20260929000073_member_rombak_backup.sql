-- =============================================================================
-- mysaf-off — Titik rollback SEBELUM rombak borang ahli (6 tab baharu)
--
-- Jalankan SEBELUM 20260929000074_member_form_rombak.sql. Migration
-- seterusnya itu memadam kolum dan meng-NULL-kan data — snapshot ini ialah
-- satu-satunya jalan rollback (docker/pg_dump tidak tersedia dalam
-- persekitaran yang menjana migration ini).
--
-- Skrip ini idempotent pada strukturnya (schema/table dicipta jika belum
-- wujud), tetapi SENGAJA tidak mengisi semula kandungan jika table sudah
-- wujud — snapshot mesti kekal beku pada keadaan SEBELUM rombak, bukan
-- ditimpa oleh `db push` berulang.
-- =============================================================================

create schema if not exists backup_20260929;

create table if not exists backup_20260929.members_pre_rombak as
table public.members;

comment on table backup_20260929.members_pre_rombak is
  'Salinan public.members SEBELUM 20260929000074_member_form_rombak.sql. Rollback point, bukan table hidup — jangan tulis padanya.';
