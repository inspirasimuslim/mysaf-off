-- =============================================================================
-- mysaf-off — Titik rollback SEBELUM rombak tab Pendidikan (borang ahli)
--
-- Jalankan SEBELUM 20260929000077_pendidikan_rombak.sql. Migration seterusnya
-- itu memadam 8 kolum dan menukar `sekolah` (text) → `sekolah_id` (uuid FK) —
-- snapshot ini ialah satu-satunya jalan rollback (docker/pg_dump masih tidak
-- tersedia dalam persekitaran migration ini dijana).
--
-- Ditambah ke schema `backup_20260929` sedia ada (rombak 6-tab borang ahli,
-- hari yang sama) — bukan schema baharu, satu nama table baharu untuk
-- snapshot rombak ini secara berasingan.
--
-- Skrip ini idempotent pada strukturnya, TAPI SENGAJA tidak mengisi semula
-- kandungan jika table sudah wujud — snapshot mesti kekal beku pada keadaan
-- SEBELUM rombak, bukan ditimpa oleh `db push` berulang.
-- =============================================================================

create table if not exists backup_20260929.members_pre_pendidikan_rombak as
table public.members;

comment on table backup_20260929.members_pre_pendidikan_rombak is
  'Salinan public.members SEBELUM 20260929000077_pendidikan_rombak.sql. Rollback point, bukan table hidup — jangan tulis padanya.';
