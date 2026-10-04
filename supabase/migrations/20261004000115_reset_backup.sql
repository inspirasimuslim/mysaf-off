-- =============================================================================
-- mysaf-off — Titik rollback SEBELUM pembersihan data besar-besaran
-- (kawasan usrah, sekolah, yuran, pipis, status pekerjaan, perkahwinan,
-- alamat semasa, usrah perkaderan) — diminta 2026-10-04.
--
-- Jalankan SEBELUM 20261004000116_reset_clear.sql. Snapshot beku pada
-- keadaan sebelum pembersihan (idempotent pada struktur, TIDAK ditimpa oleh
-- `db push` berulang) — satu-satunya jalan rollback. Sama corak
-- `20261001000100_clear_pipis_yuran_backup.sql`.
--
-- `members`: snapshot PENUH jadual (bukan sekadar kolum yang disentuh) —
-- paling mudah untuk rollback penuh satu baris jika perlu, dan jadual ini
-- tidak besar (~324 baris).
-- =============================================================================

create schema if not exists backup_20261004_reset;

create table if not exists backup_20261004_reset.members_pre_reset as
table public.members;

create table if not exists backup_20261004_reset.yuran_ledger_pre_reset as
table public.yuran_ledger;

create table if not exists backup_20261004_reset.yuran_payments_pre_reset as
table public.yuran_payments;

create table if not exists backup_20261004_reset.yuran_group_payments_pre_reset as
table public.yuran_group_payments;

create table if not exists backup_20261004_reset.pipis_contributions_pre_reset as
table public.pipis_contributions;

create table if not exists backup_20261004_reset.sekolah_usrah_groups_pre_reset as
table public.sekolah_usrah_groups;

create table if not exists backup_20261004_reset.sekolah_usrah_mad_u_pre_reset as
table public.sekolah_usrah_mad_u;

create table if not exists backup_20261004_reset.sekolah_usrah_sessions_pre_reset as
table public.sekolah_usrah_sessions;

create table if not exists backup_20261004_reset.sekolah_usrah_attendance_pre_reset as
table public.sekolah_usrah_attendance;

create table if not exists backup_20261004_reset.perkaderan_naqib_assignments_pre_reset as
table public.perkaderan_naqib_assignments;

comment on schema backup_20261004_reset is
  'Rollback point SEBELUM 20261004000116_reset_clear.sql. Bukan data hidup — jangan tulis padanya.';

do $$
declare
  t text;
  live bigint;
  snap bigint;
begin
  foreach t in array array[
    'members', 'yuran_ledger', 'yuran_payments', 'yuran_group_payments', 'pipis_contributions',
    'sekolah_usrah_groups', 'sekolah_usrah_mad_u', 'sekolah_usrah_sessions', 'sekolah_usrah_attendance',
    'perkaderan_naqib_assignments'
  ] loop
    execute format('select count(*) from public.%I', t) into live;
    execute format('select count(*) from backup_20261004_reset.%I', t || '_pre_reset') into snap;
    if live <> snap then
      raise exception 'Snapshot % tidak sepadan: asal %, salinan %', t, live, snap;
    end if;
    raise notice 'snapshot % OK: % baris', t, snap;
  end loop;
end $$;
