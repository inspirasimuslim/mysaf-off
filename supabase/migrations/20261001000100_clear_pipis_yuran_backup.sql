-- =============================================================================
-- mysaf-off — Titik rollback SEBELUM pembersihan transaksi Pipis & Yuran
--
-- Jalankan SEBELUM 20261001000101_clear_pipis_yuran.sql. Migration seterusnya
-- memadam SEMUA baris empat table di bawah — snapshot ini ialah satu-satunya
-- jalan rollback (rujukan juga untuk bayaran gateway ToyyibPay sebenar yang
-- turut dipadam atas arahan eksplisit).
--
-- Idempotent pada strukturnya, tetapi SENGAJA tidak mengisi semula table yang
-- sudah wujud — snapshot beku pada keadaan sebelum pembersihan, bukan ditimpa
-- oleh `db push` berulang. Semakan bilangan baris di hujung menggugurkan
-- migration (dan membatalkan transaksinya) jika mana-mana salinan tidak sepadan.
-- =============================================================================

create schema if not exists backup_20261001_clear_pipis_yuran;

create table if not exists backup_20261001_clear_pipis_yuran.yuran_ledger_pre_clear as
table public.yuran_ledger;

create table if not exists backup_20261001_clear_pipis_yuran.yuran_payments_pre_clear as
table public.yuran_payments;

create table if not exists backup_20261001_clear_pipis_yuran.yuran_group_payments_pre_clear as
table public.yuran_group_payments;

create table if not exists backup_20261001_clear_pipis_yuran.pipis_contributions_pre_clear as
table public.pipis_contributions;

comment on schema backup_20261001_clear_pipis_yuran is
  'Rollback point SEBELUM 20261001000101_clear_pipis_yuran.sql. Bukan data hidup — jangan tulis padanya.';

do $$
declare
  t text;
  live bigint;
  snap bigint;
begin
  foreach t in array array['yuran_ledger', 'yuran_payments', 'yuran_group_payments', 'pipis_contributions'] loop
    execute format('select count(*) from public.%I', t) into live;
    execute format('select count(*) from backup_20261001_clear_pipis_yuran.%I', t || '_pre_clear') into snap;
    if live <> snap then
      raise exception 'Snapshot % tidak sepadan: asal %, salinan %', t, live, snap;
    end if;
    raise notice 'snapshot % OK: % baris', t, snap;
  end loop;
end $$;
